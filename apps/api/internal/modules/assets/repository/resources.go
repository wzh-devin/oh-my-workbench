package repository

import (
	"context"
	"database/sql"
	d "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
	"gorm.io/gorm"
)

// Connections 和Directories只读取对应资源，不执行文件列表或统计查询。
func (r *Repository) Connections(ctx context.Context, userID int64) ([]d.Connection, error) {
	out := []d.Connection{}
	err := r.db.WithContext(ctx).Where("user_id=?", userID).Order("created_at,id").Find(&out).Error
	for i := range out {
		out[i] = d.ConnectionView(out[i])
	}
	return out, err
}
func (r *Repository) Directories(ctx context.Context, userID int64) ([]d.Entry, error) {
	out := []d.Entry{}
	err := r.db.WithContext(ctx).Raw(hiddenCTE+"SELECT e.*,0 AS size FROM omw_asset_entry e WHERE e.user_id=? AND e.kind='folder' AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)", userID, userID, userID).Scan(&out).Error
	return out, err
}

// Statistics只聚合可见文件，不附带配置、目录或最近文件。
func (r *Repository) Statistics(ctx context.Context, userID int64) (d.Statistics, error) {
	out := d.Statistics{Daily: map[string]int64{}, Storage: []d.ConnectionStats{}}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var groups []struct {
			ConnectionID                   *int64
			Day                            *string
			ConnectionGroup, DayGroup      int
			Total, Size, Images, Documents int64
		}
		from := " FROM omw_asset_entry e JOIN omw_asset_blob b ON b.id=e.blob_id WHERE e.user_id=? AND e.kind='file' AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)"
		query := hiddenCTE + ", active AS (SELECT e.connection_id,to_char(e.created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,b.size_bytes,(e.content_type LIKE 'image/%') AS image,(" + kindSQL + "='文档') AS document" + from + ") SELECT connection_id,day,GROUPING(connection_id) AS connection_group,GROUPING(day) AS day_group,count(*) AS total,COALESCE(sum(size_bytes),0) AS size,count(*) FILTER (WHERE image) AS images,count(*) FILTER (WHERE document) AS documents FROM active GROUP BY GROUPING SETS ((),(connection_id),(day))"
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
				out.Storage = append(out.Storage, d.ConnectionStats{ID: *g.ConnectionID, Total: g.Total, Size: g.Size})
			case g.Day != nil:
				out.Daily[*g.Day] = g.Total
			}
		}
		return nil
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}

// HiddenEntriesCTE供跨模块列表复用祖先回收可见性；前两个参数均为当前用户ID。
const HiddenEntriesCTE = hiddenCTE
