package repository

import (
	"errors"

	"gorm.io/gorm"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
)

const AssetsHiddenEntriesCTE = assetsHiddenCTE

type AssetsPreviewFailure uint8

const (
	AssetsPreviewRetry AssetsPreviewFailure = iota
	AssetsPreviewFailed
	AssetsPreviewWriteUnknown
)

func assetsMustID(value string) int64 { id, _ := assetdomain.ParseID(value); return id }

func AssetsContains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}

func assetsMissing(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return assetdomain.ErrNotFound
	}
	return err
}

const assetsHiddenCTE = `WITH RECURSIVE hidden AS (SELECT id FROM omw_asset_entry WHERE user_id=? AND trashed_at IS NOT NULL UNION SELECT e.id FROM omw_asset_entry e JOIN hidden h ON e.parent_id=h.id WHERE e.user_id=?) `

const assetsEntrySelect = `e.*, COALESCE(b.size_bytes,0) AS size`
