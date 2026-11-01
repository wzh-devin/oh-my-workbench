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
	assetrepo "github.com/devin/oh-my-workbench/api/internal/modules/assets/repository"
	assetservice "github.com/devin/oh-my-workbench/api/internal/modules/assets/service"
	mailrepo "github.com/devin/oh-my-workbench/api/internal/modules/mail/repository"
	mailservice "github.com/devin/oh-my-workbench/api/internal/modules/mail/service"
	settingsrepo "github.com/devin/oh-my-workbench/api/internal/modules/settings/repository"
	settingsservice "github.com/devin/oh-my-workbench/api/internal/modules/settings/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/cache"
	"github.com/devin/oh-my-workbench/api/internal/platform/database"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
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
	proxySettings, err := settingsservice.NewProxyService(settingsrepo.NewProxyRepository(db), ".local/asset-credentials.key")
	if err != nil {
		return err
	}
	routes := outbound.NewRoutes(proxySettings.ProxyURL, nil)
	defer routes.Close()
	mailbox, err := mailservice.NewService(mailrepo.NewRepository(db, rdb), mailservice.Options{
		Routes:        routes,
		EncryptionKey: conf.MailEncryptionKey, VAPIDPublicKey: conf.WebPushPublicKey,
		VAPIDPrivateKey: conf.WebPushPrivateKey, VAPIDSubject: conf.WebPushSubject,
	})
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	assetService, err := assetservice.NewService(assetrepo.NewRepository(db), assetservice.Options{
		KeyFile: ".local/asset-credentials.key", ConverterURL: conf.AssetConverterURL, Routes: routes,
	})
	if err != nil {
		stop()
		return err
	}
	defer stop()
	workersDone := make(chan struct{})
	go func() { defer close(workersDone); mailbox.Run(ctx) }()
	assetsDone := make(chan struct{})
	go func() { defer close(assetsDone); assetService.Run(ctx) }()
	server := &http.Server{Addr: conf.HTTPAddr, Handler: newRouter(db, rdb, mailbox, proxySettings, assetService), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second}
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
