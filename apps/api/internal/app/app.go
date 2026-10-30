package app

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/config"
	"github.com/devin/oh-my-workbench/api/internal/modules/mail"
	"github.com/devin/oh-my-workbench/api/internal/platform/cache"
	"github.com/devin/oh-my-workbench/api/internal/platform/database"
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
	mailbox, err := mail.NewService(mail.NewRepository(db, rdb), mail.Options{
		ProxyURL:      conf.MailProxyURL,
		EncryptionKey: conf.MailEncryptionKey, VAPIDPublicKey: conf.WebPushPublicKey,
		VAPIDPrivateKey: conf.WebPushPrivateKey, VAPIDSubject: conf.WebPushSubject,
	})
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	workersDone := make(chan struct{})
	go func() { defer close(workersDone); mailbox.Run(ctx) }()
	server := &http.Server{Addr: conf.HTTPAddr, Handler: newRouter(db, rdb, mailbox), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second}
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
	<-shutdownDone
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
