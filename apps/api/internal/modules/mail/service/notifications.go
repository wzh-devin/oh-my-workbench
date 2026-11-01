package service

import (
	"context"

	maildomain "github.com/devin/oh-my-workbench/api/internal/modules/mail/domain"
	mailrepo "github.com/devin/oh-my-workbench/api/internal/modules/mail/repository"
)

// HTTP 入口只调用业务方法，不暴露仓储、凭证或部署配置。
func (s *Service) PushConfig() (publicKey string, configured bool) {
	return s.options.VAPIDPublicKey, s.cipher != nil
}

func (s *Service) ChangeMessage(ctx context.Context, userID, id int64, input maildomain.MessageChanges) (maildomain.Message, error) {
	message, err := s.repository.ChangeMessage(ctx, userID, id, input)
	if err == nil {
		s.repository.Changed(ctx, userID)
	}
	return message, err
}

func (s *Service) Sync(ctx context.Context, userID, id int64) (maildomain.SyncJob, error) {
	if s.cipher == nil {
		return maildomain.SyncJob{}, maildomain.ErrDisabled
	}
	return s.repository.Enqueue(ctx, userID, id, "manual")
}

func (s *Service) Job(ctx context.Context, userID, id int64) (maildomain.SyncJob, error) {
	return s.repository.Job(ctx, userID, id)
}

func (s *Service) RemoveSubscription(ctx context.Context, userID int64, endpoint string) error {
	return s.repository.RemoveSubscription(ctx, userID, endpoint)
}

func (s *Service) Notifications(ctx context.Context, userID, before int64) ([]maildomain.NotificationView, error) {
	return s.repository.Notifications(ctx, userID, before)
}

func (s *Service) ReadNotifications(ctx context.Context, userID int64, ids []int64, all bool) error {
	if err := s.repository.ReadNotifications(ctx, userID, ids, all); err != nil {
		return err
	}
	s.repository.Changed(ctx, userID)
	return nil
}

func (s *Service) SetNotifications(ctx context.Context, userID int64, enabled bool) error {
	if err := s.repository.SetNotifications(ctx, userID, enabled); err != nil {
		return err
	}
	s.repository.Changed(ctx, userID)
	return nil
}

func (s *Service) SubscribeEvents(ctx context.Context, userID int64) (<-chan *mailrepo.Event, func() error, error) {
	return s.repository.Subscribe(ctx, userID)
}
