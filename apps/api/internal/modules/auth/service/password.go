package service

import (
	"context"
	"unicode/utf8"

	authdomain "github.com/devin/oh-my-workbench/api/internal/modules/auth/domain"
	passwordutil "github.com/devin/oh-my-workbench/api/internal/shared/password"
)

type SecurityState struct {
	PasswordSet bool `json:"passwordSet"`
}

func (s Service) Security(ctx context.Context, id int64) (SecurityState, error) {
	user, err := s.repo.GetByID(ctx, id)
	return SecurityState{PasswordSet: user.Password != ""}, err
}

// ChangePassword 先准备未来版本的会话，再提交密码；Redis 故障不会造成改密成功却报失败。
func (s Service) ChangePassword(ctx context.Context, id int64, current, next string) (string, error) {
	if n := utf8.RuneCountInString(current); n < 6 || n > 24 {
		return "", authdomain.ErrPasswordInput
	}
	if n := utf8.RuneCountInString(next); n < 6 || n > 24 {
		return "", authdomain.ErrPasswordInput
	}
	if err := s.repo.ReservePasswordAttempt(ctx, id); err != nil {
		return "", err
	}
	user, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return "", err
	}
	if user.Status != authdomain.UserStatusActive {
		return "", authdomain.ErrUnauthorized
	}
	matches, err := passwordutil.Verify(current, user.Password)
	if err != nil {
		return "", err
	}
	if !matches {
		return "", authdomain.ErrCurrentPassword
	}
	if current == next {
		return "", authdomain.ErrPasswordUnchanged
	}
	hash, err := passwordutil.Hash(next)
	if err != nil {
		return "", err
	}
	updated := user
	updated.Password = hash
	updated.SessionVersion++
	value, err := s.issueSession(ctx, updated)
	if err != nil {
		return "", err
	}
	if err := s.repo.ChangePassword(ctx, user, hash); err != nil {
		_ = s.repo.DeleteSession(ctx, value)
		return "", err
	}
	return value, nil
}
