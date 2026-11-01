package service

import (
	"context"
	"crypto/tls"
	"errors"
	"net"
	"time"

	"golang.org/x/net/proxy"
)

// Keep the hostname for proxy DNS; one bad upstream address must not pin TLS until timeout.
func dialMailboxTLS(ctx context.Context, dialer proxy.ContextDialer, address string, config *tls.Config) (net.Conn, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	addresses := []string{address}
	if net.ParseIP(host) == nil {
		resolve, stop := context.WithTimeout(ctx, time.Second)
		ips, err := net.DefaultResolver.LookupIPAddr(resolve, host)
		stop()
		if err == nil {
			for _, ip := range ips {
				addresses = append(addresses, net.JoinHostPort(ip.String(), port))
			}
		}
	}
	return dialMailboxAddresses(ctx, dialer, addresses, config)
}

func dialMailboxAddresses(ctx context.Context, dialer proxy.ContextDialer, addresses []string, config *tls.Config) (net.Conn, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	type result struct {
		conn net.Conn
		err  error
	}
	results := make(chan result)
	for index, address := range addresses {
		go func() {
			if index > 0 {
				timer := time.NewTimer(time.Duration(index) * 250 * time.Millisecond)
				defer timer.Stop()
				select {
				case <-ctx.Done():
					return
				case <-timer.C:
				}
			}
			conn, err := dialer.DialContext(ctx, "tcp", address)
			if err == nil {
				secure := tls.Client(conn, config)
				if err = secure.HandshakeContext(ctx); err != nil {
					_ = conn.Close()
				} else {
					conn = secure
				}
			}
			select {
			case results <- result{conn, err}:
			case <-ctx.Done():
				if conn != nil {
					_ = conn.Close()
				}
			}
		}()
	}
	var last error = errors.New("no mailbox server address")
	for range addresses {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case attempt := <-results:
			if attempt.err == nil {
				return attempt.conn, nil
			}
			last = attempt.err
		}
	}
	return nil, last
}
