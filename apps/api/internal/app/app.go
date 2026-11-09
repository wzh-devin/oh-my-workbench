package app

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/config"
	"github.com/devin/oh-my-workbench/api/internal/platform/cache"
	"github.com/devin/oh-my-workbench/api/internal/platform/database"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	assetservice "github.com/devin/oh-my-workbench/api/internal/service/assets"
	mailservice "github.com/devin/oh-my-workbench/api/internal/service/mail"
	settingsservice "github.com/devin/oh-my-workbench/api/internal/service/settings"
	"github.com/devin/oh-my-workbench/api/migrations"
)

func Run() error {
	conf := config.Get()
	db, pool, err := database.InitDatabase(&conf)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := migrations.Up(context.Background(), pool); err != nil {
		return err
	}
	rdb, err := cache.InitRedis(&conf)
	if err != nil {
		return err
	}
	defer rdb.Close()
	repos := repository.New(db, rdb)
	systemSettings := settingsservice.NewSystemService(repos)
	runtime, err := systemSettings.Initialize(context.Background())
	if err != nil {
		return err
	}
	proxySettings, err := settingsservice.NewProxyService(repos, runtime.CredentialEncryptionKey)
	if err != nil {
		return err
	}
	routes := outbound.NewRoutes(proxySettings.ProxyURL, nil)
	defer routes.Close()
	mailbox, err := mailservice.NewService(repos, mailservice.Options{
		Routes:        routes,
		EncryptionKey: runtime.MailEncryptionKey, VAPIDPublicKey: runtime.VAPIDPublicKey,
		VAPIDPrivateKey: runtime.VAPIDPrivateKey, VAPIDSubject: runtime.PushSubject,
		PushSubject: systemSettings.PushSubject,
	})
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	assetService, err := assetservice.NewService(repos, assetservice.Options{
		EncryptionKey: runtime.CredentialEncryptionKey, ConverterURL: runtime.ConverterURL, Routes: routes,
		ConverterAddress: systemSettings.ConverterURL,
	})
	if err != nil {
		stop()
		return err
	}
	defer stop()
	router, err := newRouter(repos, mailbox, proxySettings, systemSettings, runtime.JWTSecret, assetService)
	if err != nil {
		return err
	}
	workersDone := make(chan struct{})
	go func() { defer close(workersDone); mailbox.Run(ctx) }()
	assetsDone := make(chan struct{})
	go func() { defer close(assetsDone); assetService.Run(ctx) }()
	server := &http.Server{Addr: ":11990", Handler: router, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second,
		ErrorLog: slog.NewLogLogger(slog.Default().Handler(), slog.LevelError)}
	// Stop network workers before closing their database and Redis pools.
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	err = server.ListenAndServe()
	stop()
	<-workersDone
	<-assetsDone
	<-shutdownDone
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
