package assets

import "time"

type ConnectionResponse struct {
	BaseResponse
	Name            string     `json:"name"`
	Endpoint        string     `json:"endpoint"`
	PublicEndpoint  string     `json:"publicEndpoint"`
	AddressingStyle string     `json:"addressingStyle"`
	Region          string     `json:"region"`
	Bucket          string     `json:"bucket"`
	Prefix          string     `json:"prefix"`
	Enabled         bool       `json:"enabled"`
	LastCheckedAt   *time.Time `json:"lastSync"`
	LastError       string     `json:"error"`
	Version         int        `json:"version"`
	Status          string     `json:"status"`
}
