package service

import "context"

func (s *Service) NotificationPreferences(ctx context.Context, userID int64) (bool, error) {
	return s.repository.NotificationsEnabled(ctx, userID)
}
