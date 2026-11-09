package mail

import (
	"context"
	"crypto/ecdh"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"golang.org/x/net/proxy"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

func pushHostAllowed(host string) bool {
	return host == "fcm.googleapis.com" || host == "updates.push.services.mozilla.com" ||
		strings.HasSuffix(host, ".push.services.mozilla.com") || host == "web.push.apple.com" ||
		strings.HasSuffix(host, ".notify.windows.com")
}

func (s *Service) SubscribePush(ctx context.Context, userID int64, input mailreq.SubscribePushRequest) error {
	subject, err := s.pushSubject(ctx)
	if err != nil {
		return err
	}
	if s.options.VAPIDPublicKey == "" || subject == "" {
		return maildomain.ErrPushDisabled
	}
	endpoint, err := url.Parse(input.Endpoint)
	if err != nil || endpoint.Scheme != "https" || endpoint.User != nil || endpoint.Fragment != "" || endpoint.Port() != "" && endpoint.Port() != "443" || len(input.Endpoint) > 4096 || !pushHostAllowed(endpoint.Hostname()) {
		return maildomain.ErrInvalid
	}
	key, e1 := base64.RawURLEncoding.DecodeString(input.Keys.P256DH)
	auth, e2 := base64.RawURLEncoding.DecodeString(input.Keys.Auth)
	if e1 != nil || e2 != nil || len(auth) != 16 {
		return maildomain.ErrInvalid
	}
	if _, err := ecdh.P256().NewPublicKey(key); err != nil {
		return maildomain.ErrInvalid
	}
	return s.repository.PushSubscription.SaveSubscription(ctx, repository.PushSubscription{MailRecord: repository.MailRecord{UserID: userID}, Endpoint: input.Endpoint, PublicKey: input.Keys.P256DH, Auth: input.Keys.Auth})
}

// The shared proxy does not bypass the push allowlist, public-IP checks or TLS verification.
func newPushHTTPClient(dialer proxy.ContextDialer) *http.Client {
	return &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		Transport: &http.Transport{MaxIdleConns: 16, MaxIdleConnsPerHost: 4, IdleConnTimeout: 90 * time.Second, TLSHandshakeTimeout: 10 * time.Second,
			DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
				host, port, err := net.SplitHostPort(address)
				if err != nil || !pushHostAllowed(host) || port != "443" {
					return nil, maildomain.ErrInvalid
				}
				addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
				if err != nil {
					return nil, err
				}
				var last error
				for _, address := range addresses {
					ip := address.IP
					if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
						return nil, maildomain.ErrInvalid
					}
					connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
					conn, err := dialer.DialContext(connectCtx, network, net.JoinHostPort(ip.String(), port))
					cancel()
					if err == nil {
						return conn, nil
					}
					last = err
				}
				if last == nil {
					last = maildomain.ErrUnavailable
				}
				return nil, last
			}}}
}

// deliverPush drains the durable outbox; retries reuse notification IDs to collapse duplicates.
func (s *Service) deliverPush(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for ctx.Err() == nil {
		subject, err := s.pushSubject(ctx)
		if err != nil || subject == "" {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
			continue
		}
		token := randomToken()
		d, err := s.repository.MailPushDelivery.ClaimDelivery(ctx, token)
		if err != nil || d == nil {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
			continue
		}
		if d.Status == "canceled" {
			continue
		}
		// Payloads contain no subject/body: an expired browser binding cannot expose mail content.
		payload, _ := json.Marshal(map[string]string{"id": fmt.Sprint(d.NotificationID), "title": "收到新邮件", "body": "打开工作台查看", "url": fmt.Sprintf("/mail?message=%d", d.MessageID)})
		client, sendErr := s.routes.Client(ctx, d.UserID, outbound.Push, newPushHTTPClient)
		var response *http.Response
		if sendErr == nil {
			response, sendErr = webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{Endpoint: d.Endpoint, Keys: webpush.Keys{P256dh: d.PublicKey, Auth: d.Auth}}, &webpush.Options{
				HTTPClient: client, Subscriber: subject, VAPIDPublicKey: s.options.VAPIDPublicKey, VAPIDPrivateKey: s.options.VAPIDPrivateKey, TTL: 3600, Urgency: webpush.UrgencyHigh,
			})
		}
		status := 0
		if response != nil {
			status = response.StatusCode
			_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
			_ = response.Body.Close()
		}
		if err := s.repository.MailPushDelivery.FinishDelivery(ctx, *d, token, status, sendErr); err != nil && ctx.Err() == nil {
			time.Sleep(100 * time.Millisecond)
		}
	}
}
