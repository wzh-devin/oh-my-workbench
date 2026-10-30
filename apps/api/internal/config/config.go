package config

import (
	"errors"
	"os"
	"strconv"
	"sync"

	"github.com/joho/godotenv"
)

type Config struct {
	HTTPAddr          string
	CookieSecure      bool
	WorkerID          int64
	DatabaseURL       string
	RedisAddr         string
	RedisPassword     string
	JWTSecret         string
	MailEncryptionKey string
	MailProxyURL      string
	WebPushPublicKey  string
	WebPushPrivateKey string
	WebPushSubject    string
}

var load = sync.OnceValue(func() Config {
	if err := godotenv.Load(".env"); err != nil && !errors.Is(err, os.ErrNotExist) {
		panic("读取 .env 配置失败")
	}
	workerID, err := strconv.ParseInt(os.Getenv("WORKER_ID"), 10, 64)
	if err != nil || workerID < 0 || workerID > 1023 {
		panic("WORKER_ID 必须配置为 0 到 1023 的整数")
	}
	conf := Config{
		HTTPAddr:          os.Getenv("HTTP_ADDR"),
		CookieSecure:      os.Getenv("COOKIE_SECURE") != "false",
		WorkerID:          workerID,
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		RedisAddr:         os.Getenv("REDIS_ADDR"),
		RedisPassword:     os.Getenv("REDIS_PASSWORD"),
		JWTSecret:         os.Getenv("JWT_SECRET"),
		MailEncryptionKey: os.Getenv("MAIL_ENCRYPTION_KEY"),
		MailProxyURL:      os.Getenv("MAIL_PROXY_URL"),
		WebPushPublicKey:  os.Getenv("WEB_PUSH_VAPID_PUBLIC_KEY"),
		WebPushPrivateKey: os.Getenv("WEB_PUSH_VAPID_PRIVATE_KEY"),
		WebPushSubject:    os.Getenv("WEB_PUSH_SUBJECT"),
	}
	if conf.HTTPAddr == "" {
		conf.HTTPAddr = "localhost:11990"
	}
	if conf.DatabaseURL == "" || conf.RedisAddr == "" {
		panic("缺少 DATABASE_URL、REDIS_ADDR")
	}
	if len(conf.JWTSecret) < 32 {
		panic("JWT_SECRET 至少需要 32 字节")
	}
	return conf
})

func Get() Config { return load() }
