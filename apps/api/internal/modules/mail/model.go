// Package mail owns mailbox connections, cached messages and durable notifications.
package mail

import "time"

// Record gives every mailbox row the same application ID and ownership boundary.
type Record struct {
	ID        int64     `gorm:"primaryKey;autoIncrement:false" json:"id,string"`
	UserID    int64     `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Account struct {
	Record
	Name                 string     `json:"name"`
	Provider             string     `json:"provider"`
	Email                string     `json:"email"`
	CredentialCiphertext []byte     `json:"-"`
	Enabled              bool       `json:"enabled"`
	NotifyEnabled        bool       `json:"notifyEnabled"`
	Version              int        `json:"version"`
	LastSyncAt           *time.Time `json:"lastSync"`
	LastError            *string    `json:"error"`
	LeaseToken           *string    `json:"-"`
	LeaseUntil           *time.Time `json:"-"`
}

func (Account) TableName() string { return "omw_mail_account" }

// Mailbox separates historical backfill from the live cursor to prioritize new mail.
type Mailbox struct {
	Record
	AccountID            int64
	RemoteName           string
	UIDValidity          uint32
	NotificationBoundary uint32
	LiveUID              uint32
	HistoryUID           uint32
	HistoryDone          bool
}

func (Mailbox) TableName() string { return "omw_mail_mailbox" }

type Message struct {
	Record
	AccountID         int64      `json:"accountId,string"`
	MailboxID         int64      `json:"-"`
	UIDValidity       uint32     `json:"-"`
	RemoteUID         uint32     `json:"-"`
	RFCMessageID      string     `json:"-"`
	Sender            string     `json:"sender"`
	Address           string     `json:"address"`
	Recipients        string     `gorm:"type:jsonb" json:"-"`
	Subject           string     `json:"subject"`
	Preview           string     `json:"preview"`
	BodyText          *string    `json:"body"`
	BodyFetchedAt     *time.Time `json:"-"`
	BodyHTML          *string    `json:"bodyHtml,omitempty"`
	BodyFormatVersion int        `json:"-"`
	ReceivedAt        time.Time  `json:"receivedAt"`
	SizeBytes         int64      `json:"size"`
	IsRead            bool       `json:"read"`
	IsStarred         bool       `json:"starred"`
	IsArchived        bool       `json:"archived"`
	AttachmentCount   int        `json:"attachmentCount"`
	Version           int        `json:"version"`
}

func (Message) TableName() string { return "omw_mail_message" }

type Attachment struct {
	Record
	MessageID   int64  `json:"-"`
	PartID      string `json:"-"`
	Filename    string `json:"name"`
	ContentType string `json:"contentType"`
	Encoding    string `json:"-"`
	Charset     string `json:"-"`
	SizeBytes   int64  `json:"size"`
}

func (Attachment) TableName() string { return "omw_mail_attachment" }

type SyncJob struct {
	Record
	AccountID      int64      `json:"accountId,string"`
	Trigger        string     `json:"trigger"`
	Status         string     `json:"status"`
	ProcessedCount int        `json:"processedCount"`
	StartedAt      *time.Time `json:"startedAt"`
	FinishedAt     *time.Time `json:"finishedAt"`
	LastError      *string    `json:"error"`
}

func (SyncJob) TableName() string { return "omw_mail_sync_job" }

type Notification struct {
	Record
	MessageID int64      `json:"messageId,string"`
	ReadAt    *time.Time `json:"readAt"`
}

func (Notification) TableName() string { return "omw_mail_notification" }

type PushSubscription struct {
	Record
	Endpoint  string `json:"endpoint"`
	PublicKey string `json:"-"`
	Auth      string `json:"-"`
	Enabled   bool   `json:"enabled"`
}

func (PushSubscription) TableName() string { return "omw_push_subscription" }

type PushDelivery struct {
	Record
	NotificationID int64
	SubscriptionID int64
	Status         string
	Attempts       int
	NextRetryAt    time.Time
	LeaseToken     *string
	LeaseUntil     *time.Time
	LastError      *string
}

func (PushDelivery) TableName() string { return "omw_mail_push_delivery" }
