package auth

import (
	"context"
	"unicode/utf8"

	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
	authresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/auth"
	passwordutil "github.com/devin/oh-my-workbench/api/internal/shared/password"
)

// VerifyPassword 复用账号密码与现有限流，供敏感业务短期再验证。
func (s Service) VerifyPassword(ctx context.Context, id int64, current string) error {
	if n := utf8.RuneCountInString(current); n < 6 || n > 24 {
		return authdomain.ErrPasswordInput
	}
	if err := s.repo.AuthSession.ReservePasswordAttempt(ctx, id); err != nil {
		return err
	}
	user, err := s.repo.User.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if user.Status != authdomain.UserStatusActive {
		return authdomain.ErrUnauthorized
	}
	matches, err := passwordutil.Verify(current, user.Password)
	if err != nil {
		return err
	}
	if !matches {
		return authdomain.ErrCurrentPassword
	}
	return nil
}

func (s Service) Security(ctx context.Context, id int64) (authresp.SecurityStateResponse, error) {
	user, err := s.repo.User.GetByID(ctx, id)
	return authresp.SecurityStateResponse{PasswordSet: user.Password != ""}, err
}

// ChangePassword 先准备未来版本的会话，再提交密码；Redis 故障不会造成改密成功却报失败。
func (s Service) ChangePassword(ctx context.Context, id int64, current, next string) (string, error) {
	if n := utf8.RuneCountInString(current); n < 6 || n > 24 {
		return "", authdomain.ErrPasswordInput
	}
	if n := utf8.RuneCountInString(next); n < 6 || n > 24 {
		return "", authdomain.ErrPasswordInput
	}
	if err := s.repo.AuthSession.ReservePasswordAttempt(ctx, id); err != nil {
		return "", err
	}
	user, err := s.repo.User.GetByID(ctx, id)
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
	if err := s.repo.User.ChangePassword(ctx, user, hash); err != nil {
		_ = s.repo.AuthSession.DeleteSession(ctx, value)
		return "", err
	}
	return value, nil
}
