package domain

import (
	"errors"
	ad "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
	td "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
	"time"
)

var ErrInvalid = errors.New("请求参数不正确")

type Record struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Kind      string    `json:"kind"`
	Source    string    `json:"source"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Href      string    `json:"href"`
	TodoID    *string   `json:"todoId,omitempty"`
	Version   int       `json:"version"`
}
type Notification struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Title  string `json:"title"`
	Body   string `json:"body"`
	Href   string `json:"href"`
	Unread bool   `json:"unread"`
}
type PageInput struct {
	PageNum  int      `json:"pageNum"`
	PageSize int      `json:"pageSize"`
	Kind     string   `json:"kind"`
	Search   string   `json:"search"`
	Sort     string   `json:"sort"`
	ReadIDs  []string `json:"readIds"`
	Kinds    []string `json:"kinds"`
}
type RecordPage struct {
	Records []Record `json:"records"`
	Total   int64    `json:"total"`
}
type NotificationPage struct {
	Records []Notification `json:"records"`
	Total   int64          `json:"total"`
}
type TodoStats struct {
	Total     int64            `json:"total"`
	Pending   int64            `json:"pending"`
	ListCount int64            `json:"listCount"`
	Daily     map[string]int64 `json:"daily"`
}
type MailStats struct {
	Total        int64            `json:"total"`
	Unread       int64            `json:"unread"`
	AccountCount int64            `json:"accountCount"`
	Daily        map[string]int64 `json:"daily"`
}
type Statistics struct {
	Todos           TodoStats     `json:"todos"`
	Mail            MailStats     `json:"mail"`
	Assets          ad.Statistics `json:"assets"`
	StorageCount    int64         `json:"storageCount"`
	Healthy         int64         `json:"healthy"`
	ConnectionTotal int64         `json:"connectionTotal"`
}
type ConnectionIssue struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Source string `json:"source"`
	Href   string `json:"href"`
	Kind   string `json:"kind"`
}
type PendingTask struct {
	td.TaskView
	ListName string `json:"listName"`
}
type Issues struct {
	Connections []ConnectionIssue `json:"connections"`
	Pending     []PendingTask     `json:"pending"`
}
