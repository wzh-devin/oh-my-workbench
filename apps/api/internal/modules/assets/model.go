// 资产元数据与不可变对象分离；所有业务 ID 在 JSON 中以字符串传输。
package assets

import (
	"encoding/json"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type Base struct {
	ID        int64     `json:"id,string" gorm:"primaryKey"`
	UserID    int64     `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func base(userID int64) Base {
	now := time.Now().UTC()
	return Base{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}
}

type Connection struct {
	Base
	Name                 string     `json:"name"`
	Endpoint             string     `json:"endpoint"`
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

func (Connection) TableName() string { return "omw_asset_connection" }

type Entry struct {
	Base
	ConnectionID     int64      `json:"connectionId,string"`
	ParentID         *int64     `json:"parentId"`
	Kind             string     `json:"kind"`
	Name             string     `json:"name"`
	NormalizedName   string     `json:"-"`
	BlobID           *int64     `json:"-"`
	ContentType      string     `json:"type"`
	Starred          bool       `json:"starred"`
	LastOpenedAt     *time.Time `json:"lastOpenedAt"`
	TrashedAt        *time.Time `json:"trashedAt"`
	Status           string     `json:"-"`
	Version          int        `json:"version"`
	LegacyID         *string    `json:"legacyId,omitempty"`
	LegacyRestoredAt *time.Time `json:"-"`
	Size             int64      `json:"size" gorm:"->;-:migration"`
	FileCount        *int64     `json:"fileCount,omitempty" gorm:"->;-:migration"`
	Hidden           bool       `json:"hidden,omitempty" gorm:"->;-:migration"`
	Origin           string     `json:"origin" gorm:"-"`
	Thumbnail        *Thumbnail `json:"thumbnail,omitempty" gorm:"-"`
}

func (Entry) TableName() string { return "omw_asset_entry" }

// 可空父 ID 也以字符串传输，防止目录定位丢失精度。
func (e Entry) MarshalJSON() ([]byte, error) {
	type alias Entry
	var parent *string
	if e.ParentID != nil {
		v := formatID(*e.ParentID)
		parent = &v
	}
	e.Origin = "remote"
	return json.Marshal(struct {
		alias
		ParentID *string `json:"parentId"`
	}{alias(e), parent})
}

type Blob struct {
	Base
	ConnectionID    int64
	SHA256          *string
	SizeBytes       int64
	ObjectKey       string
	ObjectVersionID string
	Etag            string
	Status          string
	VerifiedAt      *time.Time
	NextRetryAt     time.Time
	LeaseToken      string
	LeaseUntil      *time.Time
	LastError       string
}

func (Blob) TableName() string { return "omw_asset_blob" }

type Upload struct {
	Base
	ConnectionID   int64      `json:"connectionId,string"`
	BlobID         int64      `json:"-"`
	ParentID       *int64     `json:"parentId,string"`
	FileName       string     `json:"name"`
	ContentType    string     `json:"type"`
	ExpectedSHA256 string     `json:"sha256"`
	SizeBytes      int64      `json:"size"`
	PartSize       int64      `json:"partSize"`
	PartCount      int        `json:"partCount"`
	S3UploadID     string     `json:"-"`
	RequestKey     string     `json:"requestKey"`
	Status         string     `json:"status"`
	ExpiresAt      time.Time  `json:"expiresAt"`
	LastError      string     `json:"error"`
	Version        int        `json:"version"`
	EntryID        *int64     `json:"-"`
	LeaseToken     string     `json:"-"`
	LeaseUntil     *time.Time `json:"-"`
	LegacyID       *string    `json:"-"`
	Parts          []Part     `json:"parts" gorm:"-"`
	Entry          *Entry     `json:"entry,omitempty" gorm:"-"`
}

func (Upload) TableName() string { return "omw_asset_upload" }

type Part struct {
	Base
	UploadID   int64      `json:"-"`
	PartNumber int        `json:"number"`
	SizeBytes  int64      `json:"size"`
	SHA256     string     `json:"sha256"`
	Etag       string     `json:"-"`
	Status     string     `json:"status"`
	LeaseToken string     `json:"-"`
	LeaseUntil *time.Time `json:"-"`
}

func (Part) TableName() string { return "omw_asset_upload_part" }

type View struct {
	Base
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	BuiltinKey  *string         `json:"builtinKey"`
	FilterQuery json.RawMessage `json:"filterQuery" gorm:"type:jsonb"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
	DeletedAt   *time.Time      `json:"-"`
}

func (View) TableName() string { return "omw_asset_view" }

// Operation 仅保存批量请求与结果用于防重；对象清理重试由 Blob 状态驱动。
type Operation struct {
	Base
	ConnectionID int64           `json:"-"`
	Kind         string          `json:"kind"`
	Status       string          `json:"status"`
	RequestKey   string          `json:"requestKey"`
	Payload      json.RawMessage `json:"-" gorm:"type:jsonb"`
	// 旧客户端要求该响应字段；同步操作错误直接返回 HTTP，不再入库。
	LastError string `json:"error" gorm:"-"`
}

func (Operation) TableName() string { return "omw_asset_operation" }

type Preview struct {
	Base
	BlobID          int64      `json:"-"`
	RendererVersion string     `json:"rendererVersion"`
	Status          string     `json:"status"`
	ObjectKey       string     `json:"-"`
	ObjectVersionID string     `json:"-"`
	SizeBytes       int64      `json:"size"`
	LastError       string     `json:"error"`
	Attempts        int        `json:"-"`
	NextRetryAt     time.Time  `json:"-"`
	LeaseToken      string     `json:"-"`
	LeaseUntil      *time.Time `json:"-"`
}

func (Preview) TableName() string { return "omw_asset_preview" }
