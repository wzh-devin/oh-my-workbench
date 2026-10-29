package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	passwordutil "github.com/devin/oh-my-workbench/api/internal/shared/password"
	tokenutil "github.com/devin/oh-my-workbench/api/internal/shared/token"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

const (
	RedisKeyPrefix  = "auth"
	RedisSessionKey = RedisKeyPrefix + ":session"
	SessionDuration = 12 * time.Hour
	// 不存在的用户仍执行同参数校验，避免通过密码计算耗时枚举账户。
	dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
)

var recordFailure = redis.NewScript(`local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return n`)

type Service struct {
	repo *Repository
	rdb  *redis.Client
}

type Session struct {
	User      UserInfo `json:"user"`
	ExpiresAt int64    `json:"expiresAt"`
}

func NewService(repository *Repository, rdb *redis.Client) *Service {
	return &Service{repo: repository, rdb: rdb}
}

func sessionKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return RedisSessionKey + ":" + hex.EncodeToString(sum[:])
}

func (s Service) Initialized(ctx context.Context) (bool, error) { return s.repo.Initialized(ctx) }

func (s Service) Login(ctx context.Context, username, plainPassword string) (UserInfo, string, error) {
	failureKey := "auth:failures:" + sessionKey(username)
	failures, err := s.rdb.Get(ctx, failureKey).Int()
	if err != nil && !errors.Is(err, redis.Nil) {
		return UserInfo{}, "", err
	}
	if failures >= 10 {
		return UserInfo{}, "", ErrRateLimited
	}
	user, err := s.repo.GetByUsername(ctx, username)
	if err != nil && !errors.Is(err, ErrCredentials) {
		return UserInfo{}, "", err
	}
	hash := user.Password
	if errors.Is(err, ErrCredentials) {
		hash = dummyHash
	}
	matches, err := passwordutil.Verify(plainPassword, hash)
	if err != nil {
		return UserInfo{}, "", err
	}
	if !matches || user.Status != UserStatusActive {
		if err := recordFailure.Run(ctx, s.rdb, []string{failureKey}).Err(); err != nil {
			return UserInfo{}, "", err
		}
		return UserInfo{}, "", ErrCredentials
	}
	now := time.Now()
	value, err := tokenutil.GenerateToken(jwt.MapClaims{"sub": strconv.FormatInt(user.ID, 10), "jti": rand.Text(), "iat": now.Unix(), "exp": now.Add(SessionDuration).Unix()})
	if err != nil {
		return UserInfo{}, "", err
	}
	payload, err := json.Marshal(userInfo(user))
	if err != nil {
		return UserInfo{}, "", err
	}
	if err = s.rdb.Set(ctx, sessionKey(value), payload, SessionDuration).Err(); err != nil {
		return UserInfo{}, "", err
	}
	if err = s.repo.RecordLogin(ctx, user.ID); err != nil {
		return UserInfo{}, "", err
	}
	if err = s.rdb.Del(ctx, failureKey).Err(); err != nil {
		return UserInfo{}, "", err
	}
	return userInfo(user), value, nil
}

func (s Service) Authenticate(ctx context.Context, value string) (Session, error) {
	claims, err := tokenutil.ParseToken(value)
	if err != nil {
		return Session{}, ErrUnauthorized
	}
	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || id <= 0 {
		return Session{}, ErrUnauthorized
	}
	cached, err := s.rdb.Get(ctx, sessionKey(value)).Result()
	if errors.Is(err, redis.Nil) {
		return Session{}, ErrUnauthorized
	}
	if err != nil {
		return Session{}, err
	}
	var info UserInfo
	if json.Unmarshal([]byte(cached), &info) != nil || info.ID != id {
		return Session{}, ErrUnauthorized
	}
	user, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return Session{}, err
	}
	if user.Status != UserStatusActive {
		return Session{}, ErrUnauthorized
	}
	return Session{User: userInfo(user), ExpiresAt: claims.ExpiresAt.Unix()}, nil
}

func (s Service) Logout(ctx context.Context, value string) error {
	if _, err := tokenutil.ParseToken(value); err != nil {
		return nil
	}
	return s.rdb.Del(ctx, sessionKey(value)).Err()
}

func (s Service) InitSystemAdmin(ctx context.Context, username, plainPassword string) error {
	initialized, err := s.repo.Initialized(ctx)
	if err != nil {
		return err
	}
	if initialized {
		return ErrInitialized
	}
	hash, err := passwordutil.Hash(plainPassword)
	if err != nil {
		return err
	}
	return s.repo.SaveUser(ctx, username, hash)
}
