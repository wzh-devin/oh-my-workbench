package notes

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

type passkeyUser struct {
	id          []byte
	name        string
	credentials []webauthn.Credential
}

func (u passkeyUser) WebAuthnID() []byte { return u.id }

func (u passkeyUser) WebAuthnName() string { return u.name }

func (u passkeyUser) WebAuthnDisplayName() string { return u.name }

func (u passkeyUser) WebAuthnCredentials() []webauthn.Credential { return u.credentials }

type ceremony struct {
	Session webauthn.SessionData
	Origin  string
	Version int
}

// Use the browser's exact same-origin HTTPS origin. Forwarded hosts never widen the RP boundary.
func PasskeyOrigin(request *http.Request) (string, error) {
	raw := request.Header.Get("Origin")
	origin, err := url.Parse(raw)
	if err != nil || origin.User != nil || origin.Host == "" || !strings.EqualFold(origin.Host, request.Host) || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		return "", notedomain.ErrInvalid
	}
	local := origin.Hostname() == "localhost" || origin.Hostname() == "127.0.0.1" || origin.Hostname() == "::1"
	if origin.Scheme != "https" && !(origin.Scheme == "http" && local) {
		return "", notedomain.ErrInvalid
	}
	return origin.String(), nil
}

func passkeyEngine(origin string) (*webauthn.WebAuthn, error) {
	u, err := url.Parse(origin)
	if err != nil {
		return nil, err
	}
	return webauthn.New(&webauthn.Config{RPDisplayName: "个人工作台", RPID: u.Hostname(), RPOrigins: []string{origin},
		AuthenticatorSelection: protocol.AuthenticatorSelection{AuthenticatorAttachment: protocol.Platform, UserVerification: protocol.VerificationRequired, ResidentKey: protocol.ResidentKeyRequirementPreferred}})
}

func ceremonyKey(user int64, session, origin, kind string) string {
	hash := sha256.Sum256([]byte(strconv.FormatInt(user, 10) + ":" + session + ":" + origin + ":" + kind))
	return hex.EncodeToString(hash[:])
}

func (s *Service) PasskeyStatus(ctx context.Context, user int64, origin string) (bool, error) {
	u, _ := url.Parse(origin)
	record, err := s.repo.NotePasskey.Passkey(ctx, user, u.Hostname())
	if errors.Is(err, notedomain.ErrNotFound) {
		return false, nil
	}
	return err == nil && len(record.Credential) > 0, err
}

func (s *Service) BeginPasskey(ctx context.Context, user int64, session, origin, kind, password string) (any, error) {
	if session == "" {
		return nil, notedomain.ErrInvalid
	}
	if err := s.repo.NoteCeremony.ReserveCeremony(ctx, strconv.FormatInt(user, 10)); err != nil {
		return nil, err
	}
	engine, err := passkeyEngine(origin)
	if err != nil {
		return nil, notedomain.ErrInvalid
	}
	record, err := s.repo.NotePasskey.Passkey(ctx, user, engine.Config.RPID)
	if err != nil && !errors.Is(err, notedomain.ErrNotFound) {
		return nil, err
	}
	u := passkeyUser{id: record.UserHandle, name: "工作台笔记"}
	if len(record.Credential) > 0 {
		var credential webauthn.Credential
		if json.Unmarshal(record.Credential, &credential) != nil {
			return nil, notedomain.ErrInvalid
		}
		u.credentials = []webauthn.Credential{credential}
	}
	var options any
	var state *webauthn.SessionData
	if kind == "register" {
		if err := s.auth.VerifyPassword(ctx, user, password); err != nil {
			return nil, err
		}
		if len(u.id) == 0 {
			u.id = make([]byte, 32)
			if _, err = rand.Read(u.id); err != nil {
				return nil, err
			}
		}
		options, state, err = engine.BeginRegistration(u)
	} else if kind == "login" {
		if len(u.credentials) == 0 {
			return nil, notedomain.ErrNotFound
		}
		options, state, err = engine.BeginLogin(u, webauthn.WithUserVerification(protocol.VerificationRequired))
	} else {
		return nil, notedomain.ErrInvalid
	}
	if err != nil {
		return nil, notedomain.ErrInvalid
	}
	state.Expires = time.Now().UTC().Add(2 * time.Minute)
	raw, err := json.Marshal(ceremony{Session: *state, Origin: origin, Version: record.Version})
	if err != nil {
		return nil, err
	}
	if err = s.repo.NoteCeremony.PutCeremony(ctx, ceremonyKey(user, session, origin, kind), raw); err != nil {
		return nil, err
	}
	return options, nil
}

func (s *Service) FinishPasskey(ctx context.Context, user int64, session, origin, kind string, request *http.Request) (time.Time, error) {
	if session == "" {
		return time.Time{}, notedomain.ErrInvalid
	}
	raw, err := s.repo.NoteCeremony.TakeCeremony(ctx, ceremonyKey(user, session, origin, kind))
	if err != nil {
		return time.Time{}, err
	}
	var state ceremony
	if json.Unmarshal(raw, &state) != nil || state.Origin != origin || time.Now().After(state.Session.Expires) {
		return time.Time{}, notedomain.ErrLocked
	}
	engine, err := passkeyEngine(origin)
	if err != nil {
		return time.Time{}, notedomain.ErrInvalid
	}
	u := passkeyUser{id: state.Session.UserID, name: "工作台笔记"}
	var credential *webauthn.Credential
	if kind == "register" {
		credential, err = engine.FinishRegistration(u, state.Session, request)
	} else if kind == "login" {
		record, e := s.repo.NotePasskey.Passkey(ctx, user, engine.Config.RPID)
		if e != nil {
			return time.Time{}, e
		}
		if record.Version != state.Version {
			return time.Time{}, notedomain.ErrPasskeyChanged
		}
		var stored webauthn.Credential
		if json.Unmarshal(record.Credential, &stored) != nil {
			return time.Time{}, notedomain.ErrInvalid
		}
		u.id = record.UserHandle
		u.credentials = []webauthn.Credential{stored}
		credential, err = engine.FinishLogin(u, state.Session, request)
	} else {
		return time.Time{}, notedomain.ErrInvalid
	}
	if err != nil || credential == nil || credential.Authenticator.CloneWarning {
		return time.Time{}, notedomain.ErrVerification
	}
	encoded, err := json.Marshal(credential)
	if err != nil {
		return time.Time{}, err
	}
	if err = s.repo.NotePasskey.SavePasskey(ctx, repository.NotePasskey{UserID: user, RPID: engine.Config.RPID, UserHandle: u.id, Credential: encoded}, state.Version); err != nil {
		return time.Time{}, err
	}
	if kind == "register" {
		return time.Time{}, nil
	}
	if err = s.repo.NoteAccess.Unlock(ctx, user, session); err != nil {
		return time.Time{}, err
	}
	return time.Now().UTC().Add(5 * time.Minute), nil
}

func (s *Service) DeletePasskey(ctx context.Context, user int64, origin, password string) error {
	if err := s.auth.VerifyPassword(ctx, user, password); err != nil {
		return err
	}
	u, _ := url.Parse(origin)
	return s.repo.NotePasskey.DeletePasskey(ctx, user, u.Hostname())
}
