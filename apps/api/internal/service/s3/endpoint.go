package s3

import (
	"context"
	"net"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/proxy"
)

var carrierNetwork = netip.MustParsePrefix("100.64.0.0/10")

func ValidEndpoint(u *url.URL) bool {
	if u == nil {
		return false
	}
	host := strings.TrimSuffix(u.Hostname(), ".")
	if ip, err := netip.ParseAddr(host); err == nil {
		return validStorageAddress(host, ip)
	}
	return host != "metadata.google.internal"
}

func validStorageAddress(host string, ip netip.Addr) bool {
	ip = ip.Unmap()
	if (!ip.IsGlobalUnicast() && !ip.IsLoopback()) || ip.IsLinkLocalUnicast() || carrierNetwork.Contains(ip) {
		return false
	}
	if !ip.IsPrivate() && !ip.IsLoopback() {
		return true
	}
	// 内网 MinIO 必须在表单中明确指定；公开域名不能解析到本机或内网。
	_, literalErr := netip.ParseAddr(host)
	return literalErr == nil || host == "localhost" || !strings.Contains(host, ".") ||
		strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") || strings.HasSuffix(host, ".lan")
}

func dialStorage(ctx context.Context, dialer proxy.ContextDialer, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, ErrEndpoint
	}
	for _, ip := range ips {
		if !validStorageAddress(strings.TrimSuffix(host, "."), ip) {
			return nil, ErrEndpoint
		}
	}
	var lastErr error
	for _, ip := range ips {
		// 拨号已校验 IP，TLS 仍由 Transport 校验原始 Endpoint 域名。
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func EndpointURL(value string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimRight(value, "/"))
	if err != nil || u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return nil, ErrInvalid
	}
	u.Host = strings.ToLower(u.Host)
	return u, nil
}
