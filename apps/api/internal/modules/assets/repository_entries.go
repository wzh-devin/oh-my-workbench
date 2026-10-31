// 目录、名称和内容引用在同一短事务内维护，复制不重复传输不可变内容。
package assets

import (
	"context"
	"time"
)

func (r *Repository) entries(userID, connectionID int64) ([]Entry, error) {
	entries := []Entry{}
	err := r.db.Table("omw_asset_entry e").Select(entrySelect).Joins("LEFT JOIN omw_asset_blob b ON b.id=e.blob_id").Where("e.user_id=? AND e.connection_id=? AND e.status='ready'", userID, connectionID).Find(&entries).Error
	return entries, err
}

// 普通写入只读取目录链和目标同级名称，避免每次上传扫描全部文件。
func (r *Repository) directoryEntries(userID, connectionID int64, parent *int64) ([]Entry, error) {
	entries := []Entry{}
	query := r.db.Where("user_id=? AND connection_id=? AND status='ready'", userID, connectionID)
	if parent == nil {
		query = query.Where("kind='folder' OR parent_id IS NULL")
	} else {
		query = query.Where("kind='folder' OR parent_id=?", *parent)
	}
	err := query.Find(&entries).Error
	return entries, err
}
func (r *Repository) SaveEntry(ctx context.Context, userID, id int64, input EntryInput) (Entry, error) {
	var saved Entry
	err := r.Write(ctx, userID, func(tx *Repository) error {
		var e Entry
		var err error
		if id == 0 {
			connectionID, err := parseID(input.ConnectionID)
			if err != nil {
				return err
			}
			c, err := tx.connection(userID, connectionID)
			if err != nil || !c.Enabled {
				return ErrNotFound
			}
			parent, err := parentID(input.ParentID)
			if err != nil {
				return err
			}
			if input.Name == nil {
				return ErrInvalid
			}
			e = Entry{Base: base(userID), ConnectionID: connectionID, ParentID: parent, Kind: "folder", Name: *input.Name, Version: 1, Status: "ready", LegacyID: input.LegacyID}
		} else {
			e, err = tx.entry(userID, id)
			if err != nil {
				return err
			}
			if e.Version != input.Version {
				return ErrConflict
			}
			e.Version++
		}
		all, err := tx.directoryEntries(userID, e.ConnectionID, e.ParentID)
		if err != nil {
			return err
		}
		entries := entryMap(all)
		if input.LegacyID != nil {
			var legacy Entry
			found := tx.db.Where("user_id=? AND legacy_id=?", userID, *input.LegacyID).First(&legacy)
			if found.Error == nil {
				saved = legacy
				return nil
			}
			if missing(found.Error) != ErrNotFound {
				return found.Error
			}
		}
		if hiddenEntry(e, entries) {
			return ErrNotFound
		}
		if _, err := directoryDepth(e.ParentID, entries); err != nil {
			return err
		}
		if input.Name != nil {
			e.Name = *input.Name
		}
		if !nameAvailable(entries, e.ParentID, e.Name, e.ID) {
			return ErrName
		}
		e.NormalizedName = normalizeName(e.Name)
		if input.Starred != nil {
			e.Starred = *input.Starred
		}
		now := time.Now().UTC()
		if input.Opened {
			e.LastOpenedAt = &now
		}
		write := tx.db
		if input.Opened && input.Name == nil && input.Starred == nil {
			// 访问时间不能触发 GORM 自动改写文件的修改时间。
			write = write.Omit("updated_at")
		} else {
			e.UpdatedAt = now
		}
		if err = write.Save(&e).Error; err != nil {
			return err
		}
		saved = e
		return nil
	})
	return saved, err
}

// Content 每个读取和 Range 请求都重新检查条目可见性与对象归属。
func (r *Repository) Content(ctx context.Context, userID, id int64) (Entry, Blob, Connection, error) {
	tx := NewRepository(r.db.WithContext(ctx))
	e, err := tx.VisibleEntry(ctx, userID, id)
	if err != nil || e.BlobID == nil {
		return e, Blob{}, Connection{}, ErrNotFound
	}
	var blob Blob
	if err = tx.db.Where("user_id=? AND id=? AND status='ready'", userID, *e.BlobID).First(&blob).Error; err != nil {
		return e, blob, Connection{}, missing(err)
	}
	c, err := tx.connection(userID, e.ConnectionID)
	if err == nil && !c.Enabled {
		err = ErrNotFound
	}
	return e, blob, c, err
}
func (r *Repository) Operation(ctx context.Context, userID, id int64) (Operation, error) {
	var op Operation
	err := r.db.WithContext(ctx).Where("user_id=? AND id=?", userID, id).First(&op).Error
	return op, missing(err)
}

// VisibleEntry 使用递归可见性查询，单文件预览无需读取全部目录或文件。
func (r *Repository) VisibleEntry(ctx context.Context, userID, id int64) (Entry, error) {
	var e Entry
	result := r.db.WithContext(ctx).Raw(hiddenCTE+"SELECT "+entrySelect+" FROM omw_asset_entry e LEFT JOIN omw_asset_blob b ON b.id=e.blob_id WHERE e.user_id=? AND e.id=? AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)", userID, userID, userID, id).Scan(&e)
	if result.Error != nil {
		return e, result.Error
	}
	if result.RowsAffected == 0 {
		return e, ErrNotFound
	}
	return e, nil
}
