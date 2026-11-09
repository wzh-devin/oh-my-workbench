package mail

type MailboxResponse struct {
	RecordResponse
	AccountID            int64
	RemoteName           string
	UIDValidity          uint32
	NotificationBoundary uint32
	LiveUID              uint32
	HistoryUID           uint32
	HistoryDone          bool
}
