package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"strconv"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"

	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
	authresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/auth"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	passwordutil "github.com/devin/oh-my-workbench/api/internal/shared/password"
	tokenutil "github.com/devin/oh-my-workbench/api/internal/shared/token"
)

const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

type Service struct {
	repo       *repository.Store
	signingKey string
}

func NewService(repository *repository.Store, signingKey string) *Service {
	return &Service{repo: repository, signingKey: signingKey}
}

func (s Service) Initialized(ctx context.Context) (bool, error) {
	return s.repo.SystemInitialization.Initialized(ctx)
}

func (s Service) Login(ctx context.Context, username, plainPassword string) (authresp.UserResponse, string, error) {
	failures, err := s.repo.AuthSession.LoginFailures(ctx, username)
	if err != nil {
		return authresp.UserResponse{}, "", err
	}
	if failures >= 10 {
		return authresp.UserResponse{}, "", authdomain.ErrRateLimited
	}
	user, err := s.repo.User.GetByUsername(ctx, username)
	if err != nil && !errors.Is(err, authdomain.ErrCredentials) {
		return authresp.UserResponse{}, "", err
	}
	hash := user.Password
	if errors.Is(err, authdomain.ErrCredentials) {
		hash = dummyHash
	}
	matches, err := passwordutil.Verify(plainPassword, hash)
	if err != nil {
		return authresp.UserResponse{}, "", err
	}
	if !matches || user.Status != authdomain.UserStatusActive {
		if err := s.repo.AuthSession.RecordFailure(ctx, username); err != nil {
			return authresp.UserResponse{}, "", err
		}
		return authresp.UserResponse{}, "", authdomain.ErrCredentials
	}
	value, err := s.issueSession(ctx, user)
	if err != nil {
		return authresp.UserResponse{}, "", err
	}
	if err = s.repo.User.RecordLogin(ctx, user.ID); err != nil {
		return authresp.UserResponse{}, "", err
	}
	if err = s.repo.AuthSession.ClearFailures(ctx, username); err != nil {
		return authresp.UserResponse{}, "", err
	}
	return repository.UserInfo(user), value, nil
}

func (s Service) Authenticate(ctx context.Context, value string) (authresp.SessionResponse, error) {
	claims, err := tokenutil.ParseToken(value, s.signingKey)
	if err != nil {
		return authresp.SessionResponse{}, authdomain.ErrUnauthorized
	}
	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || id <= 0 {
		return authresp.SessionResponse{}, authdomain.ErrUnauthorized
	}
	info, err := s.repo.AuthSession.SessionUser(ctx, value)
	if err != nil {
		return authresp.SessionResponse{}, err
	}
	if info.ID != id {
		return authresp.SessionResponse{}, authdomain.ErrUnauthorized
	}
	user, err := s.repo.User.GetByID(ctx, id)
	if err != nil {
		return authresp.SessionResponse{}, err
	}
	if user.Status != authdomain.UserStatusActive || info.Version != user.SessionVersion {
		return authresp.SessionResponse{}, authdomain.ErrUnauthorized
	}
	return authresp.SessionResponse{User: repository.UserInfo(user), ExpiresAt: claims.ExpiresAt.Unix()}, nil
}

func (s Service) Logout(ctx context.Context, value string) error {
	if _, err := tokenutil.ParseToken(value, s.signingKey); err != nil {
		return nil
	}
	return s.repo.AuthSession.DeleteSession(ctx, value)
}

func (s Service) InitSystemAdmin(ctx context.Context, username, plainPassword string) error {
	initialized, err := s.repo.SystemInitialization.Initialized(ctx)
	if err != nil {
		return err
	}
	if initialized {
		return authdomain.ErrInitialized
	}
	hash, err := passwordutil.Hash(plainPassword)
	if err != nil {
		return err
	}
	return s.repo.User.SaveUser(ctx, username, hash)
}

// issueSession 的缓存绑定密码版本，密码变更不需要扫描或删除其他会话。
func (s Service) issueSession(ctx context.Context, user repository.User) (string, error) {
	now := time.Now()
	value, err := tokenutil.GenerateToken(jwt.MapClaims{"sub": strconv.FormatInt(user.ID, 10), "jti": rand.Text(), "iat": now.Unix(), "exp": now.Add(authdomain.SessionDuration).Unix()}, s.signingKey)
	if err != nil {
		return "", err
	}
	if err := s.repo.AuthSession.SaveSession(ctx, value, user); err != nil {
		return "", err
	}
	return value, nil
}
