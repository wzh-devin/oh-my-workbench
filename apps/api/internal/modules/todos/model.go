package todos

import "time"

type Record struct {
	ID        int64 `gorm:"primaryKey;autoIncrement:false"`
	UserID    int64
	CreatedAt time.Time
	UpdatedAt time.Time
}

type List struct {
	Record
	Name     string
	LegacyID *string
}

func (List) TableName() string { return "omw_todo_list" }

type Task struct {
	Record
	ListID      *int64
	Title       string
	Note        string
	Done        bool
	Priority    int
	DueDate     *time.Time
	PlannedFor  *time.Time
	CompletedAt *time.Time
	Tags        []string `gorm:"serializer:json;type:jsonb"`
	SourceKind  *string
	SourceRef   *string
	SourceLabel *string
	Version     int
	LegacyID    *string
}

func (Task) TableName() string { return "omw_todo" }

type Step struct {
	Record
	TodoID   int64
	Title    string
	Done     bool
	Position int
}

func (Step) TableName() string { return "omw_todo_step" }
