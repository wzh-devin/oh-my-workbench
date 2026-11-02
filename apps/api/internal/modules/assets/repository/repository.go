package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// 资产分页、汇总、视图和用户写锁；所有 SQL 仅存在于 Repository。
type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db} }

// 同用户短事务串行维护名称、引用和最后一个视图；网络传输绝不持有此锁。
func (r *Repository) Write(ctx context.Context, userID int64, fn func(*Repository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var id int64
		if err := tx.Raw("SELECT id FROM omw_user WHERE id=? FOR UPDATE", userID).Scan(&id).Error; err != nil {
			return err
		}
		if id == 0 {
			return assetdomain.ErrNotFound
		}
		return fn(NewRepository(tx))
	})
}

func missing(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return assetdomain.ErrNotFound
	}
	return err
}

func (r *Repository) FindConnection(userID, id int64) (assetdomain.Connection, error) {
	var c assetdomain.Connection
	err := r.db.Where("user_id=? AND id=?", userID, id).First(&c).Error
	return c, missing(err)
}

func (r *Repository) Connection(ctx context.Context, userID, id int64) (assetdomain.Connection, error) {
	return NewRepository(r.db.WithContext(ctx)).FindConnection(userID, id)
}

func (r *Repository) ConnectionUsed(userID, id int64) (bool, error) {
	var count int64
	err := r.db.Model(&assetdomain.Blob{}).Where("user_id=? AND connection_id=? AND status<>'cleaned'", userID, id).Count(&count).Error
	return count > 0, err
}

func (r *Repository) SaveConnection(c *assetdomain.Connection) error { return r.db.Save(c).Error }

func (r *Repository) CheckedConnection(ctx context.Context, userID, id int64, version int, message string) (assetdomain.Connection, error) {
	var c assetdomain.Connection
	err := r.Write(ctx, userID, func(tx *Repository) error {
		var err error
		c, err = tx.FindConnection(userID, id)
		if err != nil {
			return err
		}
		if c.Version != version {
			return assetdomain.ErrConflict
		}
		now := time.Now().UTC()
		c.LastCheckedAt = &now
		c.LastError = message
		c.UpdatedAt = now
		c.Version++
		return tx.SaveConnection(&c)
	})
	return assetdomain.ConnectionView(c), err
}

func (r *Repository) EnsureViews(ctx context.Context, userID int64) error {
	var exists bool
	if err := r.db.WithContext(ctx).Raw("SELECT EXISTS(SELECT 1 FROM omw_asset_view WHERE user_id=?)", userID).Scan(&exists).Error; err != nil || exists {
		return err
	}

	return r.Write(ctx, userID, func(tx *Repository) error {
		var count int64
		if err := tx.db.Model(&assetdomain.View{}).Where("user_id=?", userID).Count(&count).Error; err != nil || count > 0 {
			return err
		}
		for _, v := range []struct{ key, name, icon, rule, sort string }{{"files", "全部文件", "files", assetdomain.AlwaysRule, "name"}, {"recent", "最近访问", "clock", `{"schemaVersion":1,"root":{"kind":"not","child":{"kind":"condition","op":"is_null","args":[{"kind":"fact","path":"lastOpenedAt"}]}}}`, "opened"}, {"starred", "收藏", "star", `{"schemaVersion":1,"root":{"kind":"condition","op":"eq","args":[{"kind":"fact","path":"starred"},{"kind":"constant","value":true}]}}`, "name"}} {
			key := v.key
			view := assetdomain.View{Base: assetdomain.NewBase(userID), Name: v.name, Icon: v.icon, BuiltinKey: &key, FilterQuery: json.RawMessage(v.rule), Sort: v.sort, Version: 1}
			if err := tx.db.Create(&view).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) views(userID int64) ([]assetdomain.View, error) {
	views := []assetdomain.View{}
	err := r.db.Where("user_id=? AND deleted_at IS NULL", userID).Order("created_at,id").Find(&views).Error
	return views, err
}

func (r *Repository) Views(ctx context.Context, userID int64) ([]assetdomain.View, error) {
	if err := r.EnsureViews(ctx, userID); err != nil {
		return nil, err
	}
	return NewRepository(r.db.WithContext(ctx)).views(userID)
}

func (r *Repository) view(userID, id int64) (assetdomain.View, error) {
	var v assetdomain.View
	err := r.db.Where("user_id=? AND id=? AND deleted_at IS NULL", userID, id).First(&v).Error
	return v, missing(err)
}

func (r *Repository) SaveView(ctx context.Context, userID, id int64, input assetdomain.ViewInput) (assetdomain.View, error) {
	var saved assetdomain.View
	err := r.Write(ctx, userID, func(tx *Repository) error {
		if err := tx.validateReferences(userID, input.FilterQuery); err != nil {
			return err
		}
		var count int64
		if err := tx.db.Model(&assetdomain.View{}).Where("user_id=? AND deleted_at IS NULL AND id<>? AND name=?", userID, id, input.Name).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return assetdomain.ErrName
		}
		view := assetdomain.View{Base: assetdomain.NewBase(userID), Version: 1}
		if id != 0 {
			var err error
			view, err = tx.view(userID, id)
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
func (r *Repository) DeleteViews(ctx context.Context, userID int64, items []assetdomain.BatchItem) error {
	return r.Write(ctx, userID, func(tx *Repository) error {
		var count int64
		if e := tx.db.Model(&assetdomain.View{}).Where("user_id=? AND deleted_at IS NULL", userID).Count(&count).Error; e != nil {
			return e
		}
		if count <= int64(len(items)) {
			return assetdomain.ErrLastView
		}
		for _, item := range items {
			id, _ := assetdomain.ParseID(item.ID)
			v, e := tx.view(userID, id)
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
func (r *Repository) DeleteView(ctx context.Context, userID, id int64, version int) error {
	return r.DeleteViews(ctx, userID, []assetdomain.BatchItem{{ID: assetdomain.FormatID(id), Version: version}})
}

// 回收站可见性独立于用户规则，父目录回收后整棵子树隐藏。
const hiddenCTE = `WITH RECURSIVE hidden AS (SELECT id FROM omw_asset_entry WHERE user_id=? AND trashed_at IS NOT NULL UNION SELECT e.id FROM omw_asset_entry e JOIN hidden h ON e.parent_id=h.id WHERE e.user_id=?) `

const entrySelect = `e.*, COALESCE(b.size_bytes,0) AS size`

func (r *Repository) validateReferences(userID int64, document json.RawMessage) error {
	var doc struct {
		Root node `json:"root"`
	}
	if json.Unmarshal(document, &doc) != nil {
		return assetdomain.ErrRule
	}
	ids := map[int64]bool{}
	folderIDs := map[int64]bool{}
	var walk func(node)
	walk = func(n node) {
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
		if err := r.db.Raw(hiddenCTE+"SELECT count(*) FROM omw_asset_entry WHERE user_id=? AND id IN ? AND kind='folder' AND status='ready' AND id NOT IN (SELECT id FROM hidden)", userID, userID, userID, keys).Scan(&count).Error; err != nil {
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
	if err := r.db.Model(&assetdomain.Connection{}).Where("user_id=? AND id IN ?", userID, keys).Count(&count).Error; err != nil {
		return err
	}
	if count != int64(len(keys)) {
		return assetdomain.ErrRule
	}
	return nil
}

func (r *Repository) Query(ctx context.Context, userID int64, input assetdomain.QueryInput) (assetdomain.QueryResult, error) {
	result := assetdomain.QueryResult{Entries: []assetdomain.Entry{}}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		tx := NewRepository(db)
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
			if _, err = tx.FindConnection(userID, id); err != nil {
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
			view, err := tx.view(userID, id)
			if err != nil {
				return err
			}
			if err = tx.validateReferences(userID, view.FilterQuery); err != nil {
				return err
			}
			sql, values, err := RuleSQL(view.FilterQuery)
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
		if err := tx.validateReferences(userID, input.FilterQuery); err != nil {
			return err
		}
		filter, values, err := RuleSQL(input.FilterQuery)
		if err != nil {
			return err
		}
		where += " AND (" + filter + ")"
		args = append(args, values...)
		if input.Search != "" {
			where += " AND e.name ILIKE ? ESCAPE '\\'"
			args = append(args, "%"+escapeLike(input.Search)+"%")
		}
		order := queryOrder(sort)
		from := " FROM omw_asset_entry e LEFT JOIN omw_asset_blob b ON b.id=e.blob_id WHERE " + where
		if input.CursorMode || input.Cursor != "" {
			scope := cursorScope(where, args, order)
			if input.Cursor != "" {
				condition, values, err := order.after(input.Cursor, scope)
				if err != nil {
					return err
				}
				from += " AND " + condition
				args = append(args, values...)
			}
			args = append(args, input.PageSize+1)
			if err := db.Raw(hiddenCTE+"SELECT "+entrySelect+from+" ORDER BY (e.kind='folder') DESC,"+order.SQL()+", e.id DESC LIMIT ?", args...).Scan(&result.Entries).Error; err != nil {
				return err
			}
			result.HasMore = len(result.Entries) > input.PageSize
			if result.HasMore {
				result.Entries = result.Entries[:input.PageSize]
				result.NextCursor = order.cursor(result.Entries[len(result.Entries)-1], scope)
			}
			return nil
		}
		if err := db.Raw(hiddenCTE+"SELECT count(*)"+from, args...).Scan(&result.Total).Error; err != nil {
			return err
		}
		args = append(args, input.PageSize, input.Page*input.PageSize)
		if err := db.Raw(hiddenCTE+"SELECT "+entrySelect+from+" ORDER BY (e.kind='folder') DESC,"+order.SQL()+", e.id DESC LIMIT ? OFFSET ?", args...).Scan(&result.Entries).Error; err != nil {
			return err
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (r *Repository) Overview(ctx context.Context, userID int64) (assetdomain.Overview, error) {
	result := assetdomain.Overview{Connections: []assetdomain.Connection{}, Folders: []assetdomain.Entry{}, Recent: []assetdomain.Entry{}, Views: []assetdomain.View{}, Daily: map[string]int64{}, Storage: []assetdomain.ConnectionStats{}}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		if err := db.Where("user_id=?", userID).Order("created_at,id").Find(&result.Connections).Error; err != nil {
			return err
		}
		for i := range result.Connections {
			result.Connections[i] = assetdomain.ConnectionView(result.Connections[i])
		}
		if err := db.Raw(hiddenCTE+"SELECT e.*,0 AS size FROM omw_asset_entry e WHERE e.user_id=? AND e.kind='folder' AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)", userID, userID, userID).Scan(&result.Folders).Error; err != nil {
			return err
		}
		var err error
		result.Views, err = NewRepository(db).views(userID)
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
		aggregate := hiddenCTE + ", active AS (SELECT e.connection_id,to_char(e.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,b.size_bytes,(e.content_type LIKE 'image/%') AS image,(" + kindSQL + "='文档') AS document" + from + ") SELECT connection_id,day,GROUPING(connection_id) AS connection_group,GROUPING(day) AS day_group,count(*) AS total,COALESCE(sum(size_bytes),0) AS size,count(*) FILTER (WHERE image) AS images,count(*) FILTER (WHERE document) AS documents FROM active GROUP BY GROUPING SETS ((),(connection_id),(day))"
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
				result.Storage = append(result.Storage, assetdomain.ConnectionStats{ID: *group.ConnectionID, Total: group.Total, Size: group.Size})
			case group.Day != nil:
				result.Daily[*group.Day] = group.Total
			}
		}
		if err := db.Raw(hiddenCTE+"SELECT "+entrySelect+from+" ORDER BY e.created_at DESC,e.id DESC LIMIT 12", userID, userID, userID).Scan(&result.Recent).Error; err != nil {
			return err
		}

		return NewRepository(db).attachThumbnails(userID, result.Recent)
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (r *Repository) entry(userID, id int64) (assetdomain.Entry, error) {
	var e assetdomain.Entry
	err := r.db.Table("omw_asset_entry e").Select(entrySelect).Joins("LEFT JOIN omw_asset_blob b ON b.id=e.blob_id").Where("e.user_id=? AND e.id=? AND e.status='ready'", userID, id).First(&e).Error
	return e, missing(err)
}

func (r *Repository) Entry(ctx context.Context, userID, id int64) (assetdomain.Entry, error) {
	return NewRepository(r.db.WithContext(ctx)).entry(userID, id)
}
