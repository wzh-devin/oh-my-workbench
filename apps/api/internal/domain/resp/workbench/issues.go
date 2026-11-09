package workbench

import todoresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/todos"

type ConnectionIssueResponse struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Source string `json:"source"`
	Href   string `json:"href"`
	Kind   string `json:"kind"`
}

type PendingTaskResponse struct {
	todoresp.TaskResponse
	ListName string `json:"listName"`
}

type IssuesResponse struct {
	Connections []ConnectionIssueResponse `json:"connections"`
	Pending     []PendingTaskResponse     `json:"pending"`
}
