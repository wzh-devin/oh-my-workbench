package token

import (
	"github.com/devin/oh-my-workbench/api/internal/config"
	"github.com/golang-jwt/jwt/v5"
)

// GenerateToken 生成Token
func GenerateToken(claims jwt.MapClaims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.Get().JWTSecret))
}

// ParseToken 只接受本服务签发、未过期且包含独立会话标识的令牌。
func ParseToken(value string) (*jwt.RegisteredClaims, error) {
	claims := &jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(value, claims, func(t *jwt.Token) (any, error) {
		return []byte(config.Get().JWTSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil {
		return nil, err
	}
	if claims.Subject == "" || claims.ID == "" {
		return nil, jwt.ErrTokenRequiredClaimMissing
	}
	return claims, nil
}
