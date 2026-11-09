package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"
	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
)

type AssetPage struct {
	Entries    []AssetEntry `json:"entries"`
	Total      int64        `json:"total"`
	NextCursor string       `json:"nextCursor,omitempty"`
	HasMore    bool         `json:"hasMore"`
}

type AssetOverview struct {
	Connections []AssetConnection          `json:"connections"`
	Folders     []AssetEntry               `json:"folders"`
	Recent      []AssetEntry               `json:"recent"`
	Views       []AssetView                `json:"views"`
	Total       int64                      `json:"total"`
	Size        int64                      `json:"size"`
	Images      int64                      `json:"images"`
	Documents   int64                      `json:"documents"`
	Daily       map[string]int64           `json:"daily"`
	Storage     []assetdto.ConnectionStats `json:"storage"`
}

type AssetEntry struct {
	AssetBase
	ConnectionID     int64               `json:"connectionId,string"`
	ParentID         *int64              `json:"parentId"`
	Kind             string              `json:"kind"`
	Name             string              `json:"name"`
	NormalizedName   string              `json:"-"`
	BlobID           *int64              `json:"-"`
	ContentType      string              `json:"type"`
	Starred          bool                `json:"starred"`
	LastOpenedAt     *time.Time          `json:"lastOpenedAt"`
	TrashedAt        *time.Time          `json:"trashedAt"`
	Status           string              `json:"-"`
	Version          int                 `json:"version"`
	LegacyID         *string             `json:"legacyId,omitempty"`
	LegacyRestoredAt *time.Time          `json:"-"`
	Size             int64               `json:"size" gorm:"->;-:migration"`
	FileCount        *int64              `json:"fileCount,omitempty" gorm:"->;-:migration"`
	Hidden           bool                `json:"hidden,omitempty" gorm:"->;-:migration"`
	Origin           string              `json:"origin" gorm:"-"`
	Thumbnail        *assetdto.Thumbnail `json:"thumbnail,omitempty" gorm:"-"`
}

func (AssetEntry) TableName() string { return "omw_asset_entry" }

// 逻辑目录的可见性、深度、名称与复制规则；不访问数据库或对象存储。
func AssetEntryMap(entries []AssetEntry) map[int64]AssetEntry {
	result := map[int64]AssetEntry{}
	for _, e := range entries {
		result[e.ID] = e
	}
	return result
}

func AssetHiddenEntry(e AssetEntry, entries map[int64]AssetEntry) bool {
	for depth := 0; depth <= 64; depth++ {
		if e.TrashedAt != nil {
			return true
		}
		if e.ParentID == nil {
			return false
		}
		var ok bool
		e, ok = entries[*e.ParentID]
		if !ok {
			return true
		}
	}
	return true
}

func AssetDirectoryDepth(parent *int64, entries map[int64]AssetEntry) (int, error) {
	depth := 0
	seen := map[int64]bool{}
	for parent != nil {
		e, ok := entries[*parent]
		if !ok || e.Kind != "folder" || AssetHiddenEntry(e, entries) || seen[e.ID] {
			return 0, assetdomain.ErrNotFound
		}
		seen[e.ID] = true
		depth++
		if depth >= 64 {
			return 0, assetdomain.ErrInvalid
		}
		parent = e.ParentID
	}
	return depth, nil
}

func AssetNameAvailable(entries map[int64]AssetEntry, parent *int64, name string, exclude int64) bool {
	for _, e := range entries {
		if e.ID != exclude && e.TrashedAt == nil && assetdomain.SameParent(e.ParentID, parent) && assetdomain.NormalizeName(e.Name) == assetdomain.NormalizeName(name) {
			return false
		}
	}
	return true
}

func AssetCopyName(entries map[int64]AssetEntry, parent *int64, name string, folder bool) string {
	names := map[string]bool{}
	for _, entry := range entries {
		if entry.TrashedAt == nil && assetdomain.SameParent(entry.ParentID, parent) {
			names[assetdomain.NormalizeName(entry.Name)] = true
		}
	}
	if !names[assetdomain.NormalizeName(name)] {
		return name
	}
	stem, extension := name, ""
	if dot := strings.LastIndex(name, "."); !folder && dot > 0 {
		stem, extension = name[:dot], name[dot:]
	}
	for index := 1; ; index++ {
		suffix := fmt.Sprintf(" (%d)", index)
		extensionRunes := []rune(extension)
		extensionRunes = extensionRunes[:min(len(extensionRunes), max(0, 199-len([]rune(suffix))))]
		stemRunes := []rune(stem)
		limit := 200 - len([]rune(suffix)) - len(extensionRunes)
		candidate := string(stemRunes[:min(len(stemRunes), limit)]) + suffix + string(extensionRunes)
		if !names[assetdomain.NormalizeName(candidate)] {
			return candidate
		}
	}
}

func AssetDescendantOf(e AssetEntry, id int64, entries map[int64]AssetEntry) bool {
	for depth := 0; e.ParentID != nil && depth <= 64; depth++ {
		if *e.ParentID == id {
			return true
		}
		var ok bool
		e, ok = entries[*e.ParentID]
		if !ok {
			return false
		}
	}
	return false
}

// AssetCloneSubtrees 建立子节点和同级名称索引，只复制活动条目并保留不可变内容引用。
func AssetCloneSubtrees(userID int64, all, roots []AssetEntry, parent *int64) ([]AssetEntry, []int64) {
	entries := AssetEntryMap(all)
	children := map[int64][]AssetEntry{}
	siblings := map[string]map[int64]AssetEntry{}
	parentKey := func(parent *int64) string {
		if parent == nil {
			return ""
		}
		return assetdomain.FormatID(*parent)
	}
	for _, entry := range all {
		if entry.ParentID != nil {
			children[*entry.ParentID] = append(children[*entry.ParentID], entry)
		}
		key := parentKey(entry.ParentID)
		if siblings[key] == nil {
			siblings[key] = map[int64]AssetEntry{}
		}
		siblings[key][entry.ID] = entry
	}
	copied := []AssetEntry{}
	blobIDs := map[int64]bool{}
	var clone func(AssetEntry, *int64)
	clone = func(source AssetEntry, destination *int64) {
		if AssetHiddenEntry(source, entries) {
			return
		}
		key := parentKey(destination)
		if siblings[key] == nil {
			siblings[key] = map[int64]AssetEntry{}
		}
		copy := source
		copy.AssetBase = NewAssetBase(userID)
		copy.ParentID = destination
		copy.Name = AssetCopyName(siblings[key], destination, source.Name, source.Kind == "folder")
		copy.NormalizedName = assetdomain.NormalizeName(copy.Name)
		copy.Version = 1
		copy.Starred = false
		copy.LastOpenedAt = nil
		copy.TrashedAt = nil
		copy.LegacyID = nil
		copy.LegacyRestoredAt = nil
		copied = append(copied, copy)
		siblings[key][copy.ID] = copy
		if copy.BlobID != nil {
			blobIDs[*copy.BlobID] = true
		}
		for _, child := range children[source.ID] {
			clone(child, &copy.ID)
		}
	}
	for _, root := range roots {
		clone(root, parent)
	}
	ids := make([]int64, 0, len(blobIDs))
	for id := range blobIDs {
		ids = append(ids, id)
	}
	return copied, ids
}

// 改名不改变内容类型，已识别Office即使改掉扩展名仍可复用预览。
func AssetOfficeFilename(e AssetEntry) string {
	extension := map[string]string{
		"application/msword":            ".doc",
		"application/vnd.ms-excel":      ".xls",
		"application/vnd.ms-powerpoint": ".ppt",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document":   ".docx",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         ".xlsx",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
		"application/vnd.oasis.opendocument.text":                                   ".odt",
		"application/vnd.oasis.opendocument.spreadsheet":                            ".ods",
		"application/vnd.oasis.opendocument.presentation":                           ".odp",
	}[e.ContentType]
	if extension != "" {
		if strings.EqualFold(filepath.Ext(e.Name), extension) {
			return e.Name
		}
		return e.Name + extension
	}
	if assetdomain.OfficeName(e.Name) {
		return e.Name
	}
	return ""
}

// 批量操作在短事务内完成元数据变更，物理内容删除交给持久化清理任务。
func (r *AssetEntryRepository) Batch(ctx context.Context, userID int64, input assetreq.BatchRequest) (AssetOperation, error) {
	var result AssetOperation
	err := r.Write(ctx, userID, func(tx *Store) error {
		var existing AssetOperation
		found := tx.db.Where("user_id=? AND request_key=?", userID, input.RequestKey).First(&existing)
		if found.Error == nil {
			var previous assetreq.BatchRequest
			if json.Unmarshal(existing.Payload, &previous) != nil {
				return assetdomain.ErrConflict
			}
			before, _ := json.Marshal(previous)
			after, _ := json.Marshal(input)
			if string(before) != string(after) {
				return assetdomain.ErrConflict
			}
			result = existing
			return nil
		}
		if assetsMissing(found.Error) != assetdomain.ErrNotFound {
			return found.Error
		}
		selected := []AssetEntry{}
		selectedMap := map[int64]bool{}
		var connectionID int64
		for _, item := range input.Entries {
			id, _ := assetdomain.ParseID(item.ID)
			e, err := tx.AssetEntry.entry(userID, id)
			if err != nil {
				return err
			}
			if e.Version != item.Version {
				return assetdomain.ErrConflict
			}
			if connectionID != 0 && connectionID != e.ConnectionID {
				return assetdomain.ErrInvalid
			}
			connectionID = e.ConnectionID
			selected = append(selected, e)
			selectedMap[id] = true
		}
		c, err := tx.AssetConnection.FindConnection(userID, connectionID)
		if err != nil || !c.Enabled {
			return assetdomain.ErrNotFound
		}
		all, err := tx.AssetEntry.entries(userID, connectionID)
		if err != nil {
			return err
		}
		entries := AssetEntryMap(all)
		roots := []AssetEntry{}
		for _, e := range selected {
			nested := false
			for id := range selectedMap {
				if AssetDescendantOf(e, id, entries) {
					nested = true
					break
				}
			}
			if !nested {
				roots = append(roots, e)
			}
		}
		if input.Action == "star" {
			roots = selected
		}
		parent, err := assetdomain.ParentID(input.ParentID)
		if err != nil {
			return err
		}
		if input.Action == "move" || input.Action == "copy" {
			target, err := assetdomain.ParseID(input.ConnectionID)
			if err != nil || target != connectionID {
				return assetdomain.ErrInvalid
			}
			targetDepth, err := AssetDirectoryDepth(parent, entries)
			if err != nil {
				return err
			}
			for _, root := range roots {
				if parent != nil && (*parent == root.ID || AssetDescendantOf(entries[*parent], root.ID, entries)) {
					return assetdomain.ErrInvalid
				}
				sourceDepth, err := AssetDirectoryDepth(root.ParentID, entries)
				if err != nil {
					return err
				}
				for _, e := range all {
					if e.ID == root.ID || AssetDescendantOf(e, root.ID, entries) {
						depth := 0
						for p := e.ParentID; p != nil; {
							depth++
							v, ok := entries[*p]
							if !ok {
								return assetdomain.ErrInvalid
							}
							p = v.ParentID
						}
						if targetDepth+depth-sourceDepth >= 64 {
							return assetdomain.ErrInvalid
						}
					}
				}
			}
		}
		now := time.Now().UTC()
		removed := []int64{}
		for _, root := range roots {
			hidden := AssetHiddenEntry(root, entries)
			if input.Action == "delete" || input.Action == "restore" {
				if !hidden {
					return assetdomain.ErrInvalid
				}
			} else if hidden {
				return assetdomain.ErrNotFound
			}
			switch input.Action {
			case "trash":
				root.TrashedAt = &now
			case "restore":
				if root.TrashedAt == nil {
					continue
				}
				if root.ParentID != nil {
					p, ok := entries[*root.ParentID]
					if !ok || AssetHiddenEntry(p, entries) {
						root.ParentID = nil
					}
				}
				root.Name = AssetCopyName(entries, root.ParentID, root.Name, root.Kind == "folder")
				root.TrashedAt = nil
			case "move":
				if !AssetNameAvailable(entries, parent, root.Name, root.ID) {
					return assetdomain.ErrName
				}
				root.ParentID = parent
			case "star":
				root.Starred = input.Starred
			case "delete":
				for _, e := range all {
					if e.ID == root.ID || AssetDescendantOf(e, root.ID, entries) {
						removed = append(removed, e.ID)
					}
				}
				continue
			case "copy":
				continue
			}
			root.NormalizedName = assetdomain.NormalizeName(root.Name)
			root.Version++
			root.UpdatedAt = now
			if err := tx.db.Save(&root).Error; err != nil {
				return err
			}
			entries[root.ID] = root
		}
		// 批量校验共享对象并批量写入，复制大目录不产生逐文件 SQL。
		if input.Action == "copy" {
			copied, ids := AssetCloneSubtrees(userID, all, roots, parent)
			for offset := 0; offset < len(ids); offset += 1000 {
				batch := ids[offset:min(offset+1000, len(ids))]
				var count int64
				if err := tx.db.Model(&AssetBlob{}).Where("user_id=? AND connection_id=? AND id IN ? AND status='ready' AND verified_at IS NOT NULL", userID, connectionID, batch).Count(&count).Error; err != nil {
					return err
				}
				if count != int64(len(batch)) {
					return assetdomain.ErrConflict
				}
			}
			if err := tx.db.CreateInBatches(&copied, 500).Error; err != nil {
				return err
			}
		}
		if len(removed) > 0 {
			// 分批绑定参数，整棵目录仍在同一事务中原子删除。
			for offset := 0; offset < len(removed); offset += 1000 {
				batch := removed[offset:min(offset+1000, len(removed))]
				if err := tx.db.Where("user_id=? AND id IN ?", userID, batch).Delete(&AssetEntry{}).Error; err != nil {
					return err
				}
			}
			if err := tx.db.Model(&AssetBlob{}).Where("user_id=? AND connection_id=? AND status='ready' AND NOT EXISTS (SELECT 1 FROM omw_asset_entry e WHERE e.blob_id=omw_asset_blob.id)", userID, connectionID).Updates(map[string]any{"status": "cleaning", "next_retry_at": now, "updated_at": now}).Error; err != nil {
				return err
			}
		}
		payload, _ := json.Marshal(input)
		status := "completed"
		if input.Action == "delete" {
			var pending int64
			if err := tx.db.Model(&AssetBlob{}).Where("user_id=? AND connection_id=? AND status='cleaning'", userID, connectionID).Count(&pending).Error; err != nil {
				return err
			}
			if pending > 0 {
				status = "cleaning"
			}
		}
		result = AssetOperation{AssetBase: NewAssetBase(userID), ConnectionID: connectionID, Kind: input.Action, Status: status, RequestKey: input.RequestKey, Payload: payload}
		return tx.db.Create(&result).Error
	})
	return result, err
}

func (r *AssetEntryRepository) Directories(ctx context.Context, userID int64) ([]AssetEntry, error) {
	out := []AssetEntry{}
	err := r.db.WithContext(ctx).Raw(assetsHiddenCTE+"SELECT e.*,0 AS size FROM omw_asset_entry e WHERE e.user_id=? AND e.kind='folder' AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)", userID, userID, userID).Scan(&out).Error
	return out, err
}

// Statistics只聚合可见文件，不附带配置、目录或最近文件。
func (r *AssetEntryRepository) Statistics(ctx context.Context, userID int64) (assetdto.Statistics, error) {
	out := assetdto.Statistics{Daily: map[string]int64{}, Storage: []assetdto.ConnectionStats{}}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var groups []struct {
			ConnectionID                   *int64
			Day                            *string
			ConnectionGroup, DayGroup      int
			Total, Size, Images, Documents int64
		}
		from := " FROM omw_asset_entry e JOIN omw_asset_blob b ON b.id=e.blob_id WHERE e.user_id=? AND e.kind='file' AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)"
		query := assetsHiddenCTE + ", active AS (SELECT e.connection_id,to_char(e.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,b.size_bytes,(e.content_type LIKE 'image/%') AS image,(" + assetsKindSQL + "='文档') AS document" + from + ") SELECT connection_id,day,GROUPING(connection_id) AS connection_group,GROUPING(day) AS day_group,count(*) AS total,COALESCE(sum(size_bytes),0) AS size,count(*) FILTER (WHERE image) AS images,count(*) FILTER (WHERE document) AS documents FROM active GROUP BY GROUPING SETS ((),(connection_id),(day))"
		if err := db.Raw(query, userID, userID, userID).Scan(&groups).Error; err != nil {
			return err
		}
		for _, g := range groups {
			switch {
			case g.ConnectionGroup == 1 && g.DayGroup == 1:
				out.Total = g.Total
				out.Size = g.Size
				out.Images = g.Images
				out.Documents = g.Documents
			case g.ConnectionID != nil:
				out.Storage = append(out.Storage, assetdto.ConnectionStats{ID: *g.ConnectionID, Total: g.Total, Size: g.Size})
			case g.Day != nil:
				out.Daily[*g.Day] = g.Total
			}
		}
		return nil
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}

// 目录、名称和内容引用在同一短事务内维护，复制不重复传输不可变内容。
func (r *AssetEntryRepository) entries(userID, connectionID int64) ([]AssetEntry, error) {
	entries := []AssetEntry{}
	err := r.db.Table("omw_asset_entry e").Select(assetsEntrySelect).Joins("LEFT JOIN omw_asset_blob b ON b.id=e.blob_id").Where("e.user_id=? AND e.connection_id=? AND e.status='ready'", userID, connectionID).Find(&entries).Error
	return entries, err
}

// 普通写入只读取目录链和目标同级名称，避免每次上传扫描全部文件。
func (r *AssetEntryRepository) directoryEntries(userID, connectionID int64, parent *int64) ([]AssetEntry, error) {
	entries := []AssetEntry{}
	query := r.db.Where("user_id=? AND connection_id=? AND status='ready'", userID, connectionID)
	if parent == nil {
		query = query.Where("kind='folder' OR parent_id IS NULL")
	} else {
		query = query.Where("kind='folder' OR parent_id=?", *parent)
	}
	err := query.Find(&entries).Error
	return entries, err
}

func (r *AssetEntryRepository) SaveEntry(ctx context.Context, userID, id int64, input assetreq.SaveEntryRequest) (AssetEntry, error) {
	var saved AssetEntry
	err := r.Write(ctx, userID, func(tx *Store) error {
		var e AssetEntry
		var err error
		if id == 0 {
			connectionID, err := assetdomain.ParseID(input.ConnectionID)
			if err != nil {
				return err
			}
			c, err := tx.AssetConnection.FindConnection(userID, connectionID)
			if err != nil || !c.Enabled {
				return assetdomain.ErrNotFound
			}
			parent, err := assetdomain.ParentID(input.ParentID)
			if err != nil {
				return err
			}
			if input.Name == nil {
				return assetdomain.ErrInvalid
			}
			e = AssetEntry{AssetBase: NewAssetBase(userID), ConnectionID: connectionID, ParentID: parent, Kind: "folder", Name: *input.Name, Version: 1, Status: "ready", LegacyID: input.LegacyID}
		} else {
			e, err = tx.AssetEntry.entry(userID, id)
			if err != nil {
				return err
			}
			if e.Version != input.Version {
				return assetdomain.ErrConflict
			}
			e.Version++
		}
		all, err := tx.AssetEntry.directoryEntries(userID, e.ConnectionID, e.ParentID)
		if err != nil {
			return err
		}
		entries := AssetEntryMap(all)
		if input.LegacyID != nil {
			var legacy AssetEntry
			found := tx.db.Where("user_id=? AND legacy_id=?", userID, *input.LegacyID).First(&legacy)
			if found.Error == nil {
				saved = legacy
				return nil
			}
			if assetsMissing(found.Error) != assetdomain.ErrNotFound {
				return found.Error
			}
		}
		if AssetHiddenEntry(e, entries) {
			return assetdomain.ErrNotFound
		}
		if _, err := AssetDirectoryDepth(e.ParentID, entries); err != nil {
			return err
		}
		if input.Name != nil {
			if e.Kind == "file" {
				_, previous := assetdomain.FileNameParts(e.Name)
				_, next := assetdomain.FileNameParts(*input.Name)
				if previous != next {
					return assetdomain.ErrExtension
				}
			}
			e.Name = *input.Name
		}
		if !AssetNameAvailable(entries, e.ParentID, e.Name, e.ID) {
			return assetdomain.ErrName
		}
		e.NormalizedName = assetdomain.NormalizeName(e.Name)
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
func (r *AssetEntryRepository) Content(ctx context.Context, userID, id int64) (AssetEntry, AssetBlob, AssetConnection, error) {
	tx := New(r.db.WithContext(ctx), nil)
	e, err := tx.AssetEntry.VisibleEntry(ctx, userID, id)
	if err != nil || e.BlobID == nil {
		return e, AssetBlob{}, AssetConnection{}, assetdomain.ErrNotFound
	}
	var blob AssetBlob
	if err = tx.db.Where("user_id=? AND id=? AND status='ready'", userID, *e.BlobID).First(&blob).Error; err != nil {
		return e, blob, AssetConnection{}, assetsMissing(err)
	}
	c, err := tx.AssetConnection.FindConnection(userID, e.ConnectionID)
	if err == nil && !c.Enabled {
		err = assetdomain.ErrNotFound
	}
	return e, blob, c, err
}

// VisibleEntry 使用递归可见性查询，单文件预览无需读取全部目录或文件。
func (r *AssetEntryRepository) VisibleEntry(ctx context.Context, userID, id int64) (AssetEntry, error) {
	var e AssetEntry
	result := r.db.WithContext(ctx).Raw(assetsHiddenCTE+"SELECT "+assetsEntrySelect+" FROM omw_asset_entry e LEFT JOIN omw_asset_blob b ON b.id=e.blob_id WHERE e.user_id=? AND e.id=? AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)", userID, userID, userID, id).Scan(&e)
	if result.Error != nil {
		return e, result.Error
	}
	if result.RowsAffected == 0 {
		return e, assetdomain.ErrNotFound
	}
	return e, nil
}

// 用户写锁内读取同目录的占用名，包括尚未发布的上传，避免批次内同名竞争。
func (r *AssetEntryRepository) uploadNames(entries []AssetEntry, userID, connectionID int64, parent *int64, exclude int64) (map[string]bool, error) {
	names := map[string]bool{}
	for _, entry := range entries {
		if entry.TrashedAt == nil && assetdomain.SameParent(entry.ParentID, parent) {
			names[assetdomain.NormalizeName(entry.Name)] = true
		}
	}
	query := r.db.Model(&AssetUpload{}).Where("user_id=? AND connection_id=? AND id<>? AND status IN ('initializing','uploading','paused','completing','verifying','failed') AND expires_at>?", userID, connectionID, exclude, time.Now().UTC())
	if parent == nil {
		query = query.Where("parent_id IS NULL")
	} else {
		query = query.Where("parent_id=?", *parent)
	}
	var reserved []string
	if err := query.Pluck("file_name", &reserved).Error; err != nil {
		return nil, err
	}
	for _, name := range reserved {
		names[assetdomain.NormalizeName(name)] = true
	}
	return names, nil
}

// 同用户短事务串行维护名称、引用和最后一个视图；网络传输绝不持有此锁。
func (r *AssetEntryRepository) Write(ctx context.Context, userID int64, fn func(*Store) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var id int64
		if err := tx.Raw("SELECT id FROM omw_user WHERE id=? FOR UPDATE", userID).Scan(&id).Error; err != nil {
			return err
		}
		if id == 0 {
			return assetdomain.ErrNotFound
		}
		return fn(New(tx, nil))
	})
}

func (r *AssetEntryRepository) validateReferences(userID int64, document json.RawMessage) error {
	var doc struct {
		Root assetsNode `json:"root"`
	}
	if json.Unmarshal(document, &doc) != nil {
		return assetdomain.ErrRule
	}
	ids := map[int64]bool{}
	folderIDs := map[int64]bool{}
	var walk func(assetsNode)
	walk = func(n assetsNode) {
		for _, child := range n.Children {
			walk(child)
		}
		if n.Child != nil {
			walk(*n.Child)
		}
		if len(n.Args) == 2 && n.Args[0].Path == "connectionId" {
			var value string
			if json.Unmarshal(n.Args[1].Value, &value) == nil {
				id, _ := assetdomain.ParseID(value)
				ids[id] = true
			}
		}
		if len(n.Args) == 2 && n.Args[0].Path == "parentId" {
			var value string
			if json.Unmarshal(n.Args[1].Value, &value) == nil && value != "root" {
				id, _ := assetdomain.ParseID(value)
				folderIDs[id] = true
			}
		}
	}
	walk(doc.Root)
	if len(folderIDs) > 0 {
		keys := []int64{}
		for id := range folderIDs {
			keys = append(keys, id)
		}
		var count int64
		if err := r.db.Raw(assetsHiddenCTE+"SELECT count(*) FROM omw_asset_entry WHERE user_id=? AND id IN ? AND kind='folder' AND status='ready' AND id NOT IN (SELECT id FROM hidden)", userID, userID, userID, keys).Scan(&count).Error; err != nil {
			return err
		}
		if count != int64(len(keys)) {
			return assetdomain.ErrRule
		}
	}
	if len(ids) == 0 {
		return nil
	}
	keys := []int64{}
	for id := range ids {
		keys = append(keys, id)
	}
	var count int64
	if err := r.db.Model(&AssetConnection{}).Where("user_id=? AND id IN ?", userID, keys).Count(&count).Error; err != nil {
		return err
	}
	if count != int64(len(keys)) {
		return assetdomain.ErrRule
	}
	return nil
}

func (r *AssetEntryRepository) Query(ctx context.Context, userID int64, input assetreq.EntryPageRequest) (AssetPage, error) {
	result := AssetPage{Entries: []AssetEntry{}}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		tx := New(db, nil)
		where := "e.user_id=? AND e.status='ready'"
		args := []any{userID, userID, userID}
		sort := input.Sort
		if input.Trash {
			where += " AND e.trashed_at IS NOT NULL AND (e.parent_id IS NULL OR e.parent_id NOT IN (SELECT id FROM hidden))"
		} else {
			where += " AND e.id NOT IN (SELECT id FROM hidden)"
		}
		if input.ConnectionID != "" && input.ConnectionID != "all" {
			id, err := assetdomain.ParseID(input.ConnectionID)
			if err != nil {
				return err
			}
			if _, err = tx.AssetConnection.FindConnection(userID, id); err != nil {
				return err
			}
			where += " AND e.connection_id=?"
			args = append(args, id)
		}
		if input.ViewID != "" {
			id, err := assetdomain.ParseID(input.ViewID)
			if err != nil {
				return err
			}
			view, err := tx.AssetView.view(userID, id)
			if err != nil {
				return err
			}
			if err = tx.AssetEntry.validateReferences(userID, view.FilterQuery); err != nil {
				return err
			}
			sql, values, err := AssetsRuleSQL(view.FilterQuery)
			if err != nil {
				return err
			}
			where += " AND (" + sql + ")"
			args = append(args, values...)
			if sort == "" {
				sort = view.Sort
			}
		} else if !input.Trash {
			parent, err := assetdomain.ParentID(input.ParentID)
			if err != nil {
				return err
			}
			if parent != nil {
				where += " AND e.parent_id=?"
				args = append(args, *parent)
			} else if input.Search == "" && string(input.FilterQuery) == assetdomain.AlwaysRule {
				where += " AND e.parent_id IS NULL"
			}
		}
		if err := tx.AssetEntry.validateReferences(userID, input.FilterQuery); err != nil {
			return err
		}
		filter, values, err := AssetsRuleSQL(input.FilterQuery)
		if err != nil {
			return err
		}
		where += " AND (" + filter + ")"
		args = append(args, values...)
		if input.Search != "" {
			where += " AND e.name ILIKE ? ESCAPE '\\'"
			args = append(args, "%"+assetsEscapeLike(input.Search)+"%")
		}
		order := assetsQueryOrder(sort)
		from := " FROM omw_asset_entry e LEFT JOIN omw_asset_blob b ON b.id=e.blob_id WHERE " + where
		if input.CursorMode || input.Cursor != "" {
			scope := assetsCursorScope(where, args, order)
			if input.Cursor != "" {
				condition, values, err := order.assetsAfter(input.Cursor, scope)
				if err != nil {
					return err
				}
				from += " AND " + condition
				args = append(args, values...)
			}
			args = append(args, input.PageSize+1)
			if err := db.Raw(assetsHiddenCTE+"SELECT "+assetsEntrySelect+from+" ORDER BY (e.kind='folder') DESC,"+order.AssetsSQL()+", e.id DESC LIMIT ?", args...).Scan(&result.Entries).Error; err != nil {
				return err
			}
			result.HasMore = len(result.Entries) > input.PageSize
			if result.HasMore {
				result.Entries = result.Entries[:input.PageSize]
				result.NextCursor = order.assetsCursor(result.Entries[len(result.Entries)-1], scope)
			}
			return nil
		}
		if err := db.Raw(assetsHiddenCTE+"SELECT count(*)"+from, args...).Scan(&result.Total).Error; err != nil {
			return err
		}
		args = append(args, input.PageSize, input.Page*input.PageSize)
		if err := db.Raw(assetsHiddenCTE+"SELECT "+assetsEntrySelect+from+" ORDER BY (e.kind='folder') DESC,"+order.AssetsSQL()+", e.id DESC LIMIT ? OFFSET ?", args...).Scan(&result.Entries).Error; err != nil {
			return err
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (r *AssetEntryRepository) Overview(ctx context.Context, userID int64) (AssetOverview, error) {
	result := AssetOverview{Connections: []AssetConnection{}, Folders: []AssetEntry{}, Recent: []AssetEntry{}, Views: []AssetView{}, Daily: map[string]int64{}, Storage: []assetdto.ConnectionStats{}}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		if err := db.Where("user_id=?", userID).Order("created_at,id").Find(&result.Connections).Error; err != nil {
			return err
		}
		for i := range result.Connections {
			result.Connections[i] = AssetConnectionView(result.Connections[i])
		}
		if err := db.Raw(assetsHiddenCTE+"SELECT e.*,0 AS size FROM omw_asset_entry e WHERE e.user_id=? AND e.kind='folder' AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)", userID, userID, userID).Scan(&result.Folders).Error; err != nil {
			return err
		}
		var err error
		result.Views, err = New(db, nil).AssetView.views(userID)
		if err != nil {
			return err
		}
		from := " FROM omw_asset_entry e JOIN omw_asset_blob b ON b.id=e.blob_id WHERE e.user_id=? AND e.kind='file' AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)"
		// 一次扫描同时生成总量、存储和按天统计，避免并发汇总重复扫描同一批条目。
		var groups []struct {
			ConnectionID                   *int64
			Day                            *string
			ConnectionGroup, DayGroup      int
			Total, Size, Images, Documents int64
		}
		aggregate := assetsHiddenCTE + ", active AS (SELECT e.connection_id,to_char(e.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,b.size_bytes,(e.content_type LIKE 'image/%') AS image,(" + assetsKindSQL + "='文档') AS document" + from + ") SELECT connection_id,day,GROUPING(connection_id) AS connection_group,GROUPING(day) AS day_group,count(*) AS total,COALESCE(sum(size_bytes),0) AS size,count(*) FILTER (WHERE image) AS images,count(*) FILTER (WHERE document) AS documents FROM active GROUP BY GROUPING SETS ((),(connection_id),(day))"
		if err := db.Raw(aggregate, userID, userID, userID).Scan(&groups).Error; err != nil {
			return err
		}
		for _, group := range groups {
			switch {
			case group.ConnectionGroup == 1 && group.DayGroup == 1:
				result.Total = group.Total
				result.Size = group.Size
				result.Images = group.Images
				result.Documents = group.Documents
			case group.ConnectionID != nil:
				result.Storage = append(result.Storage, assetdto.ConnectionStats{ID: *group.ConnectionID, Total: group.Total, Size: group.Size})
			case group.Day != nil:
				result.Daily[*group.Day] = group.Total
			}
		}
		if err := db.Raw(assetsHiddenCTE+"SELECT "+assetsEntrySelect+from+" ORDER BY e.created_at DESC,e.id DESC LIMIT 12", userID, userID, userID).Scan(&result.Recent).Error; err != nil {
			return err
		}

		return New(db, nil).AssetPreview.attachThumbnails(userID, result.Recent)
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (r *AssetEntryRepository) entry(userID, id int64) (AssetEntry, error) {
	var e AssetEntry
	err := r.db.Table("omw_asset_entry e").Select(assetsEntrySelect).Joins("LEFT JOIN omw_asset_blob b ON b.id=e.blob_id").Where("e.user_id=? AND e.id=? AND e.status='ready'", userID, id).First(&e).Error
	return e, assetsMissing(err)
}

func (r *AssetEntryRepository) Entry(ctx context.Context, userID, id int64) (AssetEntry, error) {
	return New(r.db.WithContext(ctx), nil).AssetEntry.entry(userID, id)
}

// 以条目主键游标每轮读取20项，旧文件补齐有界且不阻塞上传工作协程。
func (r *AssetEntryRepository) ThumbnailBackfill(ctx context.Context, after int64) ([]AssetEntry, error) {
	entries := []AssetEntry{}
	err := r.db.WithContext(ctx).Table("omw_asset_entry e").Select(assetsEntrySelect).Joins("JOIN omw_asset_blob b ON b.id=e.blob_id AND b.user_id=e.user_id AND b.status='ready'").Joins("JOIN omw_asset_connection c ON c.id=e.connection_id AND c.user_id=e.user_id AND c.enabled=true").Where("e.id>? AND e.kind='file' AND e.status='ready' AND e.trashed_at IS NULL", after).Order("e.id").Limit(20).Find(&entries).Error
	return entries, err
}

// 导入只修改当前用户已登记的旧 ID，浏览器原件不会被服务端删除。
// ImportMetadata 在整批内容上传后恢复原收藏、时间和独立回收状态。
func (r *AssetEntryRepository) ImportMetadata(ctx context.Context, userID int64, input []assetreq.ImportEntryRequest) error {
	if len(input) == 0 || len(input) > 200 {
		return assetdomain.ErrInvalid
	}
	for _, item := range input {
		if !assetdomain.ValidText(item.LegacyID, 100) || item.CreatedAt.IsZero() {
			return assetdomain.ErrInvalid
		}
	}
	return r.Write(ctx, userID, func(tx *Store) error {
		for _, item := range input {
			var e AssetEntry
			if err := tx.db.Where("user_id=? AND legacy_id=? AND status='ready'", userID, item.LegacyID).First(&e).Error; err != nil {
				return assetsMissing(err)
			}
			if e.LegacyRestoredAt != nil {
				continue
			}
			updated := item.CreatedAt
			if item.UpdatedAt != nil {
				updated = *item.UpdatedAt
			}
			if updated.IsZero() {
				updated = time.Now().UTC()
			}
			if err := tx.db.Model(&e).Updates(map[string]any{"starred": item.Starred, "created_at": item.CreatedAt, "updated_at": updated, "last_opened_at": item.LastOpenedAt, "trashed_at": item.TrashedAt, "version": e.Version + 1, "legacy_restored_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// LegacyEntry 兼容导入前的文件定位链接，返回新的稳定 ID 与目录位置。
func (r *AssetEntryRepository) LegacyEntry(ctx context.Context, userID int64, legacyID string) (AssetEntry, error) {
	if id, err := assetdomain.ParseID(legacyID); err == nil {
		return r.DetailEntry(ctx, userID, id)
	}
	if !assetdomain.ValidText(legacyID, 100) {
		return AssetEntry{}, assetdomain.ErrInvalid
	}
	var entry AssetEntry
	if err := r.db.WithContext(ctx).Where("user_id=? AND legacy_id=?", userID, legacyID).First(&entry).Error; err != nil {
		return entry, assetsMissing(err)
	}
	return r.DetailEntry(ctx, userID, entry.ID)
}

// DetailEntry 可读取自己的回收站元数据，内容读取仍走独立的可见性检查。
func (r *AssetEntryRepository) DetailEntry(ctx context.Context, userID, id int64) (AssetEntry, error) {
	var entry AssetEntry
	result := r.db.WithContext(ctx).Raw(assetsHiddenCTE+"SELECT "+assetsEntrySelect+",e.id IN (SELECT id FROM hidden) AS hidden FROM omw_asset_entry e LEFT JOIN omw_asset_blob b ON b.id=e.blob_id WHERE e.user_id=? AND e.id=? AND e.status='ready'", userID, userID, userID, id).Scan(&entry)
	if result.Error != nil {
		return entry, result.Error
	}
	if result.RowsAffected == 0 {
		return entry, assetdomain.ErrNotFound
	}
	if entry.Kind == "folder" {
		var count struct{ Total, Size int64 }
		err := r.db.WithContext(ctx).Raw(`WITH RECURSIVE contents AS (
    SELECT id,kind,blob_id,(trashed_at IS NOT NULL) AS hidden FROM omw_asset_entry WHERE user_id=? AND parent_id=? AND status='ready'
    UNION SELECT e.id,e.kind,e.blob_id,(c.hidden OR e.trashed_at IS NOT NULL) FROM omw_asset_entry e JOIN contents c ON e.parent_id=c.id WHERE e.user_id=? AND e.status='ready'
   ) SELECT count(*) AS total,COALESCE(sum(b.size_bytes),0) AS size FROM contents c JOIN omw_asset_blob b ON b.id=c.blob_id WHERE c.kind='file' AND NOT c.hidden`, userID, id, userID).Scan(&count).Error
		if err != nil {
			return entry, err
		}
		entry.FileCount = &count.Total
		entry.Size = count.Size
	}
	return entry, nil
}

type AssetEntryRepository struct{ *Store }
