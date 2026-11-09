package mail

import (
	"context"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

// HTTP 入口只调用业务方法，不暴露仓储、凭证或部署配置。
func (s *Service) PushConfig(ctx context.Context) (publicKey string, configured bool, err error) {
	subject, err := s.pushSubject(ctx)
	if err != nil {
		return "", s.cipher != nil, err
	}
	if subject == "" {
		return "", s.cipher != nil, nil
	}
	return s.options.VAPIDPublicKey, s.cipher != nil, nil
}

func (s *Service) pushSubject(ctx context.Context) (string, error) {
	if s.options.PushSubject != nil {
		return s.options.PushSubject(ctx)
	}
	return s.options.VAPIDSubject, nil
}

func (s *Service) ChangeMessage(ctx context.Context, userID, id int64, input mailreq.UpdateMessageRequest) (repository.MailMessage, error) {
	message, err := s.repository.MailMessage.ChangeMessage(ctx, userID, id, input)
	if err == nil {
		s.repository.MailEvents.Changed(ctx, userID)
	}
	return message, err
}

func (s *Service) Sync(ctx context.Context, userID, id int64) (repository.MailSyncJob, error) {
	if s.cipher == nil {
		return repository.MailSyncJob{}, maildomain.ErrDisabled
	}
	return s.repository.MailSyncJob.Enqueue(ctx, userID, id, "manual")
}

func (s *Service) Job(ctx context.Context, userID, id int64) (repository.MailSyncJob, error) {
	return s.repository.MailSyncJob.Job(ctx, userID, id)
}

func (s *Service) RemoveSubscription(ctx context.Context, userID int64, endpoint string) error {
	return s.repository.PushSubscription.RemoveSubscription(ctx, userID, endpoint)
}

func (s *Service) Notifications(ctx context.Context, userID, before int64) ([]repository.MailNotificationView, error) {
	return s.repository.MailNotification.Notifications(ctx, userID, before)
}

func (s *Service) ReadNotifications(ctx context.Context, userID int64, ids []int64, all bool) error {
	if err := s.repository.MailNotification.ReadNotifications(ctx, userID, ids, all); err != nil {
		return err
	}
	s.repository.MailEvents.Changed(ctx, userID)
	return nil
}

func (s *Service) SetNotifications(ctx context.Context, userID int64, enabled bool) error {
	if err := s.repository.User.SetNotifications(ctx, userID, enabled); err != nil {
		return err
	}
	s.repository.MailEvents.Changed(ctx, userID)
	return nil
}

func (s *Service) SubscribeEvents(ctx context.Context, userID int64) (<-chan *repository.MailEvent, func() error, error) {
	return s.repository.MailEvents.Subscribe(ctx, userID)
}
