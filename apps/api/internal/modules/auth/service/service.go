package service

import (
	"context"
	"crypto/rand"
	"errors"
	"strconv"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"

	authdomain "github.com/devin/oh-my-workbench/api/internal/modules/auth/domain"
	authrepo "github.com/devin/oh-my-workbench/api/internal/modules/auth/repository"
	passwordutil "github.com/devin/oh-my-workbench/api/internal/shared/password"
	tokenutil "github.com/devin/oh-my-workbench/api/internal/shared/token"
)

const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

type Service struct {
	repo       *authrepo.Repository
	signingKey string
}

type Session struct {
	User      authdomain.UserInfo `json:"user"`
	ExpiresAt int64               `json:"expiresAt"`
}

func NewService(repository *authrepo.Repository, signingKey string) *Service {
	return &Service{repo: repository, signingKey: signingKey}
}

func (s Service) Initialized(ctx context.Context) (bool, error) { return s.repo.Initialized(ctx) }

func (s Service) Login(ctx context.Context, username, plainPassword string) (authdomain.UserInfo, string, error) {
	failures, err := s.repo.LoginFailures(ctx, username)
	if err != nil {
		return authdomain.UserInfo{}, "", err
	}
	if failures >= 10 {
		return authdomain.UserInfo{}, "", authdomain.ErrRateLimited
	}
	user, err := s.repo.GetByUsername(ctx, username)
	if err != nil && !errors.Is(err, authdomain.ErrCredentials) {
		return authdomain.UserInfo{}, "", err
	}
	hash := user.Password
	if errors.Is(err, authdomain.ErrCredentials) {
		hash = dummyHash
	}
	matches, err := passwordutil.Verify(plainPassword, hash)
	if err != nil {
		return authdomain.UserInfo{}, "", err
	}
	if !matches || user.Status != authdomain.UserStatusActive {
		if err := s.repo.RecordFailure(ctx, username); err != nil {
			return authdomain.UserInfo{}, "", err
		}
		return authdomain.UserInfo{}, "", authdomain.ErrCredentials
	}
	value, err := s.issueSession(ctx, user)
	if err != nil {
		return authdomain.UserInfo{}, "", err
	}
	if err = s.repo.RecordLogin(ctx, user.ID); err != nil {
		return authdomain.UserInfo{}, "", err
	}
	if err = s.repo.ClearFailures(ctx, username); err != nil {
		return authdomain.UserInfo{}, "", err
	}
	return authdomain.ToUserInfo(user), value, nil
}

func (s Service) Authenticate(ctx context.Context, value string) (Session, error) {
	claims, err := tokenutil.ParseToken(value, s.signingKey)
	if err != nil {
		return Session{}, authdomain.ErrUnauthorized
	}
	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || id <= 0 {
		return Session{}, authdomain.ErrUnauthorized
	}
	info, err := s.repo.SessionUser(ctx, value)
	if err != nil {
		return Session{}, err
	}
	if info.ID != id {
		return Session{}, authdomain.ErrUnauthorized
	}
	user, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return Session{}, err
	}
	if user.Status != authdomain.UserStatusActive || info.Version != user.SessionVersion {
		return Session{}, authdomain.ErrUnauthorized
	}
	return Session{User: authdomain.ToUserInfo(user), ExpiresAt: claims.ExpiresAt.Unix()}, nil
}

func (s Service) Logout(ctx context.Context, value string) error {
	if _, err := tokenutil.ParseToken(value, s.signingKey); err != nil {
		return nil
	}
	return s.repo.DeleteSession(ctx, value)
}

func (s Service) InitSystemAdmin(ctx context.Context, username, plainPassword string) error {
	initialized, err := s.repo.Initialized(ctx)
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
	return s.repo.SaveUser(ctx, username, hash)
}

// issueSession 的缓存绑定密码版本，密码变更不需要扫描或删除其他会话。
func (s Service) issueSession(ctx context.Context, user authdomain.User) (string, error) {
	now := time.Now()
	value, err := tokenutil.GenerateToken(jwt.MapClaims{"sub": strconv.FormatInt(user.ID, 10), "jti": rand.Text(), "iat": now.Unix(), "exp": now.Add(authdomain.SessionDuration).Unix()}, s.signingKey)
	if err != nil {
		return "", err
	}
	if err := s.repo.SaveSession(ctx, value, user); err != nil {
		return "", err
	}
	return value, nil
}
