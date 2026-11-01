package service

import (
	"context"
	"errors"
	"sync"
	"time"

	imap "github.com/emersion/go-imap/v2"

	maildomain "github.com/devin/oh-my-workbench/api/internal/modules/mail/domain"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
)

// 后台邮箱监听和推送任务的生命周期与断线恢复。
// Run owns all account listeners and push delivery workers until the application stops.
func (s *Service) Run(ctx context.Context) {
	var workers sync.WaitGroup
	defer workers.Wait()
	if s.options.VAPIDPublicKey != "" {
		workers.Go(func() { s.deliverPush(ctx) })
		workers.Go(func() { s.deliverPush(ctx) })
	}
	if s.cipher == nil {
		<-ctx.Done()
		return
	}
	workers.Go(func() { s.refreshCachedBodies(ctx) })
	active := map[int64]context.CancelFunc{}
	finished := make(chan int64, 32)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	reconcile := func() {
		accounts, err := s.repository.EnabledAccounts(ctx)
		if err != nil {
			logging.Error(ctx, "mail.listeners_failed", err)
			return
		}
		enabled := map[int64]bool{}
		for _, account := range accounts {
			enabled[account.ID] = true
			if active[account.ID] != nil {
				continue
			}
			token := randomToken()
			claimed, err := s.repository.ClaimListener(ctx, account.ID, token)
			if err != nil || !claimed {
				continue
			}
			owner, cancel := context.WithCancel(ctx)
			active[account.ID] = cancel
			workers.Go(func() {
				defer func() {
					select {
					case finished <- account.ID:
					case <-ctx.Done():
					}
				}()
				s.listen(owner, account, token)
			})
		}
		for id, cancel := range active {
			if !enabled[id] {
				cancel()
			}
		}
	}
	reconcile()
	for {
		select {
		case <-ctx.Done():
			for _, cancel := range active {
				cancel()
			}
			return
		case id := <-finished:
			delete(active, id)
		case <-ticker.C:
			reconcile()
		}
	}
}

// listen renews the database lease independently of IMAP I/O and cancels on fencing failure.
func (s *Service) listen(parent context.Context, a maildomain.Account, token string) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if s.repository.RenewListener(ctx, a, token) != nil {
					cancel()
					return
				}
			}
		}
	}()
	defer func() {
		cancel()
		<-heartbeatDone
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		_ = s.repository.ReleaseListener(cleanup, a.ID, token)
	}()
	failures := 0
	for ctx.Err() == nil {
		secret, err := s.cipher.decrypt(a)
		if err == nil {
			err = s.listenSession(ctx, a, token, secret)
		}
		if ctx.Err() != nil || errors.Is(err, maildomain.ErrLease) {
			return
		}
		message := maildomain.ErrUnavailable.Error()
		// Keep the same fenced listener during backoff; a configuration change cancels its lease.
		s.repository.ListenerError(ctx, a, token, message)
		failures++
		delay := time.Duration(min(1<<min(failures, 6), 60)) * time.Second
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (s *Service) listenSession(ctx context.Context, a maildomain.Account, token, secret string) error {
	session, err := s.connectMailbox(ctx, a, secret)
	if err != nil {
		return err
	}
	defer session.close()
	validity, ceiling, err := session.selectInbox()
	if err != nil {
		return err
	}
	box, err := s.repository.PrepareMailbox(ctx, a, token, validity, ceiling)
	if err != nil {
		return err
	}
	trigger := "reconnect"
	for ctx.Err() == nil {
		job, err := s.repository.BeginSync(ctx, a, token, trigger)
		if err != nil {
			return err
		}
		syncErr := s.syncPass(ctx, a, token, session, &box, job.ID)
		if err := s.repository.FinishSync(ctx, a, token, job, syncErr); err != nil {
			return err
		}
		s.repository.Changed(ctx, a.UserID)
		if syncErr != nil {
			return syncErr
		}
		if !box.HistoryDone {
			trigger = "initial"
			continue
		}
		trigger, err = s.waitForMail(ctx, a, session, box.LiveUID)
		if err != nil {
			return err
		}
	}
	return ctx.Err()
}

// syncPass gives live mail priority and limits historical work to one batch per pass.
func (s *Service) syncPass(ctx context.Context, a maildomain.Account, token string, session *mailboxSession, box *maildomain.Mailbox, jobID int64) error {
	validity, ceiling, err := session.selectInbox()
	if err != nil {
		return err
	}
	if validity != box.UIDValidity {
		updated, err := s.repository.PrepareMailbox(ctx, a, token, validity, ceiling)
		if err != nil {
			return err
		}
		*box = updated
	}
	for box.LiveUID < ceiling {
		records, cursor, _, err := session.batch(box.LiveUID+1, ceiling)
		if err != nil {
			return err
		}
		if err = s.repository.SaveBatch(ctx, a, token, box, jobID, records, cursor, false, false); err != nil {
			return err
		}
	}
	if !box.HistoryDone {
		records, cursor, done, err := session.batch(box.HistoryUID+1, box.NotificationBoundary)
		if err != nil {
			return err
		}
		if err = s.repository.SaveBatch(ctx, a, token, box, jobID, records, cursor, true, done); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) waitForMail(ctx context.Context, a maildomain.Account, session *mailboxSession, liveUID uint32) (string, error) {
	supportsIdle := session.client.Caps().Has(imap.CapIdle)
	// Providers can acknowledge IDLE without delivering every mailbox update.
	interval := 30 * time.Second
	timer := time.NewTimer(interval)
	defer timer.Stop()
	check := time.NewTicker(2 * time.Second)
	defer check.Stop()
	// Drain SELECT notifications before entering IDLE; they are not necessarily new messages.
	for {
		select {
		case <-session.changes:
			continue
		default:
			goto drained
		}
	}
drained:
	// Close the drain-to-IDLE race by checking UIDNEXT once after draining SELECT changes.
	session.deadline()
	status, err := session.client.Status("INBOX", &imap.StatusOptions{UIDNext: true}).Wait()
	if err != nil {
		return "", err
	}
	if status.UIDNext > 0 && uint32(status.UIDNext)-1 > liveUID {
		return "idle", nil
	}
	var closeIdle func() error
	if supportsIdle {
		_ = session.conn.SetDeadline(time.Now().Add(interval + 30*time.Second))
		idle, err := session.client.Idle()
		if err != nil {
			return "", err
		}
		closeIdle = func() error {
			session.deadline()
			if err := idle.Close(); err != nil {
				return err
			}
			return idle.Wait()
		}
	} else {
		closeIdle = func() error { return nil }
	}
	for {
		trigger := ""
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-session.client.Closed():
			return "", maildomain.ErrUnavailable
		case <-session.changes:
			trigger = "idle"
		case <-timer.C:
			trigger = "poll"
		case <-check.C:
			queued, err := s.repository.HasQueuedSync(ctx, a.ID)
			if err != nil {
				return "", err
			}
			if queued {
				trigger = "manual"
			}
		}
		if trigger != "" {
			if err := closeIdle(); err != nil {
				return "", err
			}
			return trigger, nil
		}
	}
}
