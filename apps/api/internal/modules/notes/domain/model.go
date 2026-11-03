// Package domain defines encrypted notebook records and HTTP contracts.
package domain

import (
	"encoding/json"
	"errors"
	"strconv"
	"time"
)

var (
	ErrViewConflict   = errors.New("视图已在其他位置更新，请重新加载后重试")
	ErrViewName       = errors.New("视图名称已存在")
	ErrLastView       = errors.New("至少保留一个视图")
	ErrPasskeyChanged = errors.New("通行密钥已变更，请重新验证")
	ErrVerification   = errors.New("通行密钥验证失败，请重试或使用登录密码")
	ErrInvalid        = errors.New("笔记内容或参数无效")
	ErrNotFound       = errors.New("笔记或笔记本不存在")
	ErrConflict       = errors.New("笔记已在其他位置更新，请比较后重试")
	ErrLocked         = errors.New("请先解锁笔记")
	ErrUnavailable    = errors.New("记事本密钥不可用，请恢复独立密钥文件后重启服务")
)

const MaxBody = 1 << 20

type Record struct {
	ID        int64 `gorm:"primaryKey;autoIncrement:false"`
	UserID    int64
	CreatedAt time.Time
	UpdatedAt time.Time
}
type Notebook struct {
	Record
	Name     string
	Position int
	Version  int
}

func (Notebook) TableName() string { return "omw_note_notebook" }

type Note struct {
	Record
	NotebookID      *int64
	Title           string
	Tags            []string `gorm:"serializer:json;type:jsonb"`
	BodyCiphertext  []byte
	KeyID           string
	RequiresUnlock  bool
	Favorite        bool
	DiaryDate       *time.Time
	Version         int
	DeletedAt       *time.Time
	CreateRequestID string
}

func (Note) TableName() string { return "omw_note" }

type Revision struct {
	Record
	NoteID         int64
	NoteVersion    int
	BodyCiphertext []byte
	KeyID          string
}

func (Revision) TableName() string { return "omw_note_revision" }

type NotebookView struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version int    `json:"version"`
}
type NoteView struct {
	ID             string     `json:"id"`
	NotebookID     *string    `json:"notebookId"`
	Title          string     `json:"title"`
	Tags           []string   `json:"tags"`
	RequiresUnlock bool       `json:"requiresUnlock"`
	Favorite       bool       `json:"favorite"`
	DiaryDate      *string    `json:"diaryDate"`
	Version        int        `json:"version"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	DeletedAt      *time.Time `json:"deletedAt"`
	Markdown       *string    `json:"markdown,omitempty"`
	UnlockedUntil  *time.Time `json:"unlockedUntil,omitempty"`
}
type RevisionView struct {
	ID          string    `json:"id"`
	NoteVersion int       `json:"noteVersion"`
	CreatedAt   time.Time `json:"createdAt"`
	Markdown    *string   `json:"markdown,omitempty"`
}
type SaveInput struct {
	ID             string   `json:"id"`
	NotebookID     *string  `json:"notebookId"`
	Title          string   `json:"title"`
	Tags           []string `json:"tags"`
	Markdown       string   `json:"markdown"`
	RequiresUnlock bool     `json:"requiresUnlock"`
	Favorite       bool     `json:"favorite"`
	DiaryDate      *string  `json:"diaryDate"`
	Version        int      `json:"version"`
	RequestID      string   `json:"requestId"`
}
type Query struct {
	ViewID      string          `json:"viewId"`
	Sort        string          `json:"sort"`
	SavedRule   json.RawMessage `json:"-"`
	PageNum     int             `json:"pageNum"`
	PageSize    int             `json:"pageSize"`
	Scope       string          `json:"scope"`
	NotebookID  string          `json:"notebookId"`
	Search      string          `json:"search"`
	FilterQuery json.RawMessage `json:"filterQuery"`
}
type Page struct {
	Records  []NoteView `json:"records"`
	Total    int64      `json:"total"`
	PageNum  int        `json:"pageNum"`
	PageSize int        `json:"pageSize"`
}
type Target struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

func ParseID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 || strconv.FormatInt(id, 10) != value {
		return 0, ErrInvalid
	}
	return id, nil
}
func View(n Note) NoteView {
	out := NoteView{ID: strconv.FormatInt(n.ID, 10), Title: n.Title, Tags: n.Tags, RequiresUnlock: n.RequiresUnlock, Favorite: n.Favorite, Version: n.Version, CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt, DeletedAt: n.DeletedAt}
	if out.Tags == nil {
		out.Tags = []string{}
	}
	if n.NotebookID != nil {
		v := strconv.FormatInt(*n.NotebookID, 10)
		out.NotebookID = &v
	}
	if n.DiaryDate != nil {
		v := n.DiaryDate.Format(time.DateOnly)
		out.DiaryDate = &v
	}
	return out
}
