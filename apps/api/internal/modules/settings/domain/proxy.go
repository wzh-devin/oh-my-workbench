package domain

import "errors"

var ErrInvalid = errors.New("代理配置无效，请使用 socks5:// 或 socks5h:// 地址")

const ProxyKeyPrefix = "network.proxy."

type View struct {
	Service    string `json:"service"`
	Configured bool   `json:"configured"`
	Address    string `json:"address"`
	Version    int    `json:"version"`
}

type Input struct {
	ProxyURL string `json:"proxyUrl"`
	Version  int    `json:"version"`
}
