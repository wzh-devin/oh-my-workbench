package assets

type SaveConnectionRequest struct {
	ID              string `json:"id,omitempty"`
	Name            string `json:"name"`
	Endpoint        string `json:"endpoint"`
	PublicEndpoint  string `json:"publicEndpoint"`
	AddressingStyle string `json:"addressingStyle"`
	Region          string `json:"region"`
	Bucket          string `json:"bucket"`
	Prefix          string `json:"prefix"`
	AccessKey       string `json:"accessKey"`
	SecretKey       string `json:"secretKey"`
	Enabled         bool   `json:"enabled"`
	Version         int    `json:"version"`
}
