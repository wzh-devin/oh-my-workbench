package workbench

import assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"

type TodoStatsResponse struct {
	Total     int64            `json:"total"`
	Pending   int64            `json:"pending"`
	ListCount int64            `json:"listCount"`
	Daily     map[string]int64 `json:"daily"`
}

type MailStatsResponse struct {
	Total        int64            `json:"total"`
	Unread       int64            `json:"unread"`
	AccountCount int64            `json:"accountCount"`
	Daily        map[string]int64 `json:"daily"`
}

type StatisticsResponse struct {
	Todos           TodoStatsResponse   `json:"todos"`
	Mail            MailStatsResponse   `json:"mail"`
	Assets          assetdto.Statistics `json:"assets"`
	StorageCount    int64               `json:"storageCount"`
	Healthy         int64               `json:"healthy"`
	ConnectionTotal int64               `json:"connectionTotal"`
}
