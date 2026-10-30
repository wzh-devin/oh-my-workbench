// 邮箱共享拨号：可选 SOCKS5 与有界 TLS 地址切换，保留厂商证书校验。
package mail

import (
	"context"
	"crypto/tls"
	"errors"
	"net"
	"net/url"
	"strconv"
	"time"

	"golang.org/x/net/proxy"
)

func newMailboxDialer(rawURL string) (proxy.ContextDialer, error) {
	direct := &net.Dialer{Timeout: 15 * time.Second}
	if rawURL == "" {
		return direct, nil
	}
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "socks5" && u.Scheme != "socks5h") || u.Hostname() == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("MAIL_PROXY_URL 必须为 socks5:// 或 socks5h:// 代理地址")
	}
	if port := u.Port(); port != "" {
		number, err := strconv.Atoi(port)
		if err != nil || number < 1 || number > 65535 {
			return nil, errors.New("MAIL_PROXY_URL 代理端口无效")
		}
	}
	dialer, err := proxy.FromURL(u, direct)
	if err != nil {
		return nil, errors.New("MAIL_PROXY_URL 代理配置无效")
	}
	contextDialer, ok := dialer.(proxy.ContextDialer)
	if !ok {
		return nil, errors.New("MAIL_PROXY_URL 代理不支持取消连接")
	}
	return contextDialer, nil
}

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
