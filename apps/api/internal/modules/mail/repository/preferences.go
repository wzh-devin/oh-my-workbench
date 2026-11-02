package repository

import "context"

// NotificationsEnabled独立读取偏好，不附带邮件列表或统计。
func (r *Repository) NotificationsEnabled(ctx context.Context, userID int64) (bool, error) {
	var enabled bool
	err := r.db.WithContext(ctx).Table("omw_user").Select("mail_notifications_enabled").Where("id=?", userID).Scan(&enabled).Error
	return enabled, err
}
