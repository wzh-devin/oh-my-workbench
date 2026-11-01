package token

import (
	"fmt"
	"github.com/golang-jwt/jwt/v5"
)

// GenerateToken 生成Token
func GenerateToken(claims jwt.MapClaims, secret string) (string, error) {
	if len(secret) < 32 {
		return "", fmt.Errorf("登录签名密钥未初始化")
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ParseToken 只接受本服务签发、未过期且包含独立会话标识的令牌。
func ParseToken(value, secret string) (*jwt.RegisteredClaims, error) {
	if len(secret) < 32 {
		return nil, fmt.Errorf("登录签名密钥未初始化")
	}
	claims := &jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(value, claims, func(t *jwt.Token) (any, error) {
		return []byte(secret), nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil {
		return nil, err
	}
	if claims.Subject == "" || claims.ID == "" {
		return nil, jwt.ErrTokenRequiredClaimMissing
	}
	return claims, nil
}
