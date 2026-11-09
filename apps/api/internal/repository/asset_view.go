package repository

import (
	"context"
	"encoding/json"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
)

type AssetView struct {
	AssetBase
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	BuiltinKey  *string         `json:"builtinKey"`
	FilterQuery json.RawMessage `json:"filterQuery" gorm:"type:jsonb"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
	DeletedAt   *time.Time      `json:"-"`
}

func (AssetView) TableName() string { return "omw_asset_view" }

func (r *AssetViewRepository) EnsureViews(ctx context.Context, userID int64) error {
	var exists bool
	if err := r.db.WithContext(ctx).Raw("SELECT EXISTS(SELECT 1 FROM omw_asset_view WHERE user_id=?)", userID).Scan(&exists).Error; err != nil || exists {
		return err
	}

	return r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		var count int64
		if err := tx.db.Model(&AssetView{}).Where("user_id=?", userID).Count(&count).Error; err != nil || count > 0 {
			return err
		}
		for _, v := range []struct{ key, name, icon, rule, sort string }{{"files", "全部文件", "files", assetdomain.AlwaysRule, "name"}, {"recent", "最近访问", "clock", `{"schemaVersion":1,"root":{"kind":"not","child":{"kind":"condition","op":"is_null","args":[{"kind":"fact","path":"lastOpenedAt"}]}}}`, "opened"}, {"starred", "收藏", "star", `{"schemaVersion":1,"root":{"kind":"condition","op":"eq","args":[{"kind":"fact","path":"starred"},{"kind":"constant","value":true}]}}`, "name"}} {
			key := v.key
			view := AssetView{AssetBase: NewAssetBase(userID), Name: v.name, Icon: v.icon, BuiltinKey: &key, FilterQuery: json.RawMessage(v.rule), Sort: v.sort, Version: 1}
			if err := tx.db.Create(&view).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *AssetViewRepository) views(userID int64) ([]AssetView, error) {
	views := []AssetView{}
	err := r.db.Where("user_id=? AND deleted_at IS NULL", userID).Order("created_at,id").Find(&views).Error
	return views, err
}

func (r *AssetViewRepository) Views(ctx context.Context, userID int64) ([]AssetView, error) {
	if err := r.EnsureViews(ctx, userID); err != nil {
		return nil, err
	}
	return New(r.db.WithContext(ctx), nil).AssetView.views(userID)
}

func (r *AssetViewRepository) view(userID, id int64) (AssetView, error) {
	var v AssetView
	err := r.db.Where("user_id=? AND id=? AND deleted_at IS NULL", userID, id).First(&v).Error
	return v, assetsMissing(err)
}

func (r *AssetViewRepository) SaveView(ctx context.Context, userID, id int64, input assetreq.SaveViewRequest) (AssetView, error) {
	var saved AssetView
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		if err := tx.AssetEntry.validateReferences(userID, input.FilterQuery); err != nil {
			return err
		}
		var count int64
		if err := tx.db.Model(&AssetView{}).Where("user_id=? AND deleted_at IS NULL AND id<>? AND name=?", userID, id, input.Name).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return assetdomain.ErrName
		}
		view := AssetView{AssetBase: NewAssetBase(userID), Version: 1}
		if id != 0 {
			var err error
			view, err = tx.AssetView.view(userID, id)
			if err != nil {
				return err
			}
			if view.Version != input.Version {
				return assetdomain.ErrConflict
			}
			view.Version++
		}
		view.Name = input.Name
		view.Icon = input.Icon
		view.FilterQuery = input.FilterQuery
		view.Sort = input.Sort
		view.UpdatedAt = time.Now().UTC()
		saved = view
		return tx.db.Save(&view).Error
	})
	return saved, err
}

// DeleteViews applies the last-view and version checks in one user transaction.
func (r *AssetViewRepository) DeleteViews(ctx context.Context, userID int64, items []assetreq.BatchItemRequest) error {
	return r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		var count int64
		if e := tx.db.Model(&AssetView{}).Where("user_id=? AND deleted_at IS NULL", userID).Count(&count).Error; e != nil {
			return e
		}
		if count <= int64(len(items)) {
			return assetdomain.ErrLastView
		}
		for _, item := range items {
			id, _ := assetdomain.ParseID(item.ID)
			v, e := tx.AssetView.view(userID, id)
			if e != nil {
				return e
			}
			if v.Version != item.Version {
				return assetdomain.ErrConflict
			}
			if e = tx.db.Model(&v).Updates(map[string]any{"deleted_at": time.Now().UTC(), "updated_at": time.Now().UTC(), "version": v.Version + 1}).Error; e != nil {
				return e
			}
		}
		return nil
	})
}

func (r *AssetViewRepository) DeleteView(ctx context.Context, userID, id int64, version int) error {
	return r.DeleteViews(ctx, userID, []assetreq.BatchItemRequest{{ID: assetdomain.FormatID(id), Version: version}})
}

type AssetViewRepository struct{ *Store }
