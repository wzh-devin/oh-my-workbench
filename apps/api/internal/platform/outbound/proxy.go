// Package outbound owns the configured proxy; services retain destination validation.
package outbound

import (
	"errors"
	"net"
	"net/url"
	"strconv"
	"time"

	"golang.org/x/net/proxy"
)

func NewDialer(rawURL string) (proxy.ContextDialer, error) {
	direct := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	if rawURL == "" {
		return direct, nil
	}
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "socks5" && u.Scheme != "socks5h") || u.Hostname() == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("代理地址必须为 socks5:// 或 socks5h:// 代理地址")
	}
	if port := u.Port(); port != "" {
		number, err := strconv.Atoi(port)
		if err != nil || number < 1 || number > 65535 {
			return nil, errors.New("代理端口无效")
		}
	}
	dialer, err := proxy.FromURL(u, direct)
	if err != nil {
		return nil, errors.New("代理配置无效")
	}
	if _, ok := dialer.(proxy.ContextDialer); !ok {
		return nil, errors.New("代理不支持取消连接")
	}
	// Local infrastructure must remain reachable even when the outbound proxy is down.
	routes := proxy.NewPerHost(dialer, direct)
	routes.AddFromString("localhost,*.localhost,*.local,*.internal,*.lan,127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,::1/128,fc00::/7,fe80::/10")
	return routes, nil
}
