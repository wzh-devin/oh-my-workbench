package repository

import (
	"context"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
)

type AssetConnection struct {
	AssetBase
	Name                 string     `json:"name"`
	Endpoint             string     `json:"endpoint"`
	PublicEndpoint       string     `json:"publicEndpoint"`
	AddressingStyle      string     `json:"addressingStyle"`
	Region               string     `json:"region"`
	Bucket               string     `json:"bucket"`
	Prefix               string     `json:"prefix"`
	CredentialCiphertext []byte     `json:"-"`
	Enabled              bool       `json:"enabled"`
	LastCheckedAt        *time.Time `json:"lastSync"`
	LastError            string     `json:"error"`
	Version              int        `json:"version"`
	Status               string     `json:"status" gorm:"-"`
}

func (AssetConnection) TableName() string { return "omw_asset_connection" }

func AssetConnectionView(c AssetConnection) AssetConnection {
	c.Status = "error"
	if !c.Enabled {
		c.Status = "paused"
	} else if c.LastCheckedAt != nil && c.LastError == "" {
		c.Status = "connected"
	}
	return c
}

// Connections 和Directories只读取对应资源，不执行文件列表或统计查询。
func (r *AssetConnectionRepository) Connections(ctx context.Context, userID int64) ([]AssetConnection, error) {
	out := []AssetConnection{}
	err := r.db.WithContext(ctx).Where("user_id=?", userID).Order("created_at,id").Find(&out).Error
	for i := range out {
		out[i] = AssetConnectionView(out[i])
	}
	return out, err
}

func (r *AssetConnectionRepository) FindConnection(userID, id int64) (AssetConnection, error) {
	var c AssetConnection
	err := r.db.Where("user_id=? AND id=?", userID, id).First(&c).Error
	return c, assetsMissing(err)
}

func (r *AssetConnectionRepository) Connection(ctx context.Context, userID, id int64) (AssetConnection, error) {
	return New(r.db.WithContext(ctx), nil).AssetConnection.FindConnection(userID, id)
}

func (r *AssetConnectionRepository) ConnectionUsed(userID, id int64) (bool, error) {
	var count int64
	err := r.db.Model(&AssetBlob{}).Where("user_id=? AND connection_id=? AND status<>'cleaned'", userID, id).Count(&count).Error
	return count > 0, err
}

func (r *AssetConnectionRepository) SaveConnection(c *AssetConnection) error {
	return r.db.Save(c).Error
}

func (r *AssetConnectionRepository) CheckedConnection(ctx context.Context, userID, id int64, version int, message string) (AssetConnection, error) {
	var c AssetConnection
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		var err error
		c, err = tx.AssetConnection.FindConnection(userID, id)
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
		return tx.AssetConnection.SaveConnection(&c)
	})
	return AssetConnectionView(c), err
}

type AssetConnectionRepository struct{ *Store }
