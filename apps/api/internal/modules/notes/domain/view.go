package domain

import (
	"encoding/json"
	"time"
)

type SavedView struct {
	Record
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	Scope       string          `json:"scope"`
	FilterQuery json.RawMessage `json:"filterQuery" gorm:"type:jsonb"`
	Sort        string          `json:"sort"`
	BuiltinKey  *string         `json:"-"`
	Version     int             `json:"version"`
	DeletedAt   *time.Time      `json:"-"`
}

func (SavedView) TableName() string { return "omw_note_view" }

type ViewInput struct {
	Target
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	Scope       string          `json:"scope"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Sort        string          `json:"sort"`
}
type SavedViewInfo struct {
	BuiltinKey  *string         `json:"builtinKey"`
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	Scope       string          `json:"scope"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
}
