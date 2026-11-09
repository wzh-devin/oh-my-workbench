package mail

import "time"

type SyncJobResponse struct {
	RecordResponse
	AccountID      int64      `json:"accountId,string"`
	Trigger        string     `json:"trigger"`
	Status         string     `json:"status"`
	ProcessedCount int        `json:"processedCount"`
	StartedAt      *time.Time `json:"startedAt"`
	FinishedAt     *time.Time `json:"finishedAt"`
	LastError      *string    `json:"error"`
}
