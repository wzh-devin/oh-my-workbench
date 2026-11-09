package mail

import "context"

func (s *Service) NotificationPreferences(ctx context.Context, userID int64) (bool, error) {
	return s.repository.User.NotificationsEnabled(ctx, userID)
}
