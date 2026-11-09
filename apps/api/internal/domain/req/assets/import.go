package assets

import "time"

type ImportEntryRequest struct {
	LegacyID     string     `json:"legacyId"`
	Starred      bool       `json:"starred"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    *time.Time `json:"updatedAt"`
	LastOpenedAt *time.Time `json:"lastOpenedAt"`
	TrashedAt    *time.Time `json:"trashedAt"`
}

type ImportMetadataRequest struct {
	Entries []ImportEntryRequest `json:"entries"`
}
