package outbound

import (
	"context"
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/net/proxy"
)

const (
	QQ        = "qq"
	Gmail     = "gmail"
	Push      = "push"
	Storage   = "storage"
	Converter = "converter"
)

type Resolver func(context.Context, int64, string) (string, error)
type routeKey struct {
	userID  int64
	service string
}
type routedClient struct {
	address string
	client  *http.Client
}

// Routes keeps per-user/service HTTP pools separate and replaces idle pools after proxy edits.
type Routes struct {
	resolve Resolver
	direct  proxy.ContextDialer
	mu      sync.Mutex
	clients map[routeKey]routedClient
}

func NewRoutes(resolve Resolver, direct proxy.ContextDialer) *Routes {
	if direct == nil {
		direct = &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	}
	return &Routes{resolve: resolve, direct: direct, clients: map[routeKey]routedClient{}}
}

func (r *Routes) Dialer(ctx context.Context, userID int64, service string) (proxy.ContextDialer, error) {
	if r.resolve == nil {
		return r.direct, nil
	}
	address, err := r.resolve(ctx, userID, service)
	if err != nil {
		return nil, err
	}
	return NewDialer(address)
}

func (r *Routes) Client(ctx context.Context, userID int64, service string, build func(proxy.ContextDialer) *http.Client) (*http.Client, error) {
	address := ""
	var err error
	if r.resolve != nil {
		address, err = r.resolve(ctx, userID, service)
		if err != nil {
			return nil, err
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	key := routeKey{userID: userID, service: service}
	previous, exists := r.clients[key]
	if exists && previous.address == address {
		return previous.client, nil
	}
	dialer := r.direct
	if r.resolve != nil {
		dialer, err = NewDialer(address)
		if err != nil {
			return nil, err
		}
	}
	client := build(dialer)
	if exists {
		previous.client.CloseIdleConnections()
	}
	r.clients[key] = routedClient{address: address, client: client}
	return client, nil
}

func (r *Routes) Close() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for key, value := range r.clients {
		value.client.CloseIdleConnections()
		delete(r.clients, key)
	}
}
