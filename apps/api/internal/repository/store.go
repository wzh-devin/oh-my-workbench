package repository

import (
	redis "github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type Store struct {
	db                   *gorm.DB
	rdb                  *redis.Client
	AssetBlob            AssetBlobRepository
	AssetConnection      AssetConnectionRepository
	AssetEntry           AssetEntryRepository
	AssetOperation       AssetOperationRepository
	AssetPreview         AssetPreviewRepository
	AssetUpload          AssetUploadRepository
	AssetUploadPart      AssetUploadPartRepository
	AssetView            AssetViewRepository
	AuthSession          AuthSessionRepository
	MailAccount          MailAccountRepository
	MailAttachment       MailAttachmentRepository
	MailBody             MailBodyRepository
	MailEvents           MailEventsRepository
	MailMailbox          MailMailboxRepository
	MailMessage          MailMessageRepository
	MailNotification     MailNotificationRepository
	MailPushDelivery     MailPushDeliveryRepository
	MailSyncJob          MailSyncJobRepository
	Note                 NoteRepository
	NoteAccess           NoteAccessRepository
	NoteCeremony         NoteCeremonyRepository
	NoteNotebook         NoteNotebookRepository
	NotePasskey          NotePasskeyRepository
	NoteRevision         NoteRevisionRepository
	NoteView             NoteViewRepository
	PushSubscription     PushSubscriptionRepository
	SystemInitialization SystemInitializationRepository
	SystemSetting        SystemSettingRepository
	Todo                 TodoRepository
	TodoList             TodoListRepository
	TodoPriority         TodoPriorityRepository
	TodoStep             TodoStepRepository
	TodoView             TodoViewRepository
	User                 UserRepository
	Workbench            WorkbenchQueries
}

func New(db *gorm.DB, rdb *redis.Client) *Store {
	s := &Store{db: db, rdb: rdb}
	s.AssetBlob = AssetBlobRepository{s}
	s.AssetConnection = AssetConnectionRepository{s}
	s.AssetEntry = AssetEntryRepository{s}
	s.AssetOperation = AssetOperationRepository{s}
	s.AssetPreview = AssetPreviewRepository{s}
	s.AssetUpload = AssetUploadRepository{s}
	s.AssetUploadPart = AssetUploadPartRepository{s}
	s.AssetView = AssetViewRepository{s}
	s.AuthSession = AuthSessionRepository{s}
	s.MailAccount = MailAccountRepository{s}
	s.MailAttachment = MailAttachmentRepository{s}
	s.MailBody = MailBodyRepository{s}
	s.MailEvents = MailEventsRepository{s}
	s.MailMailbox = MailMailboxRepository{s}
	s.MailMessage = MailMessageRepository{s}
	s.MailNotification = MailNotificationRepository{s}
	s.MailPushDelivery = MailPushDeliveryRepository{s}
	s.MailSyncJob = MailSyncJobRepository{s}
	s.Note = NoteRepository{s}
	s.NoteAccess = NoteAccessRepository{s}
	s.NoteCeremony = NoteCeremonyRepository{s}
	s.NoteNotebook = NoteNotebookRepository{s}
	s.NotePasskey = NotePasskeyRepository{s}
	s.NoteRevision = NoteRevisionRepository{s}
	s.NoteView = NoteViewRepository{s}
	s.PushSubscription = PushSubscriptionRepository{s}
	s.SystemInitialization = SystemInitializationRepository{s}
	s.SystemSetting = SystemSettingRepository{s}
	s.Todo = TodoRepository{s}
	s.TodoList = TodoListRepository{s}
	s.TodoPriority = TodoPriorityRepository{s}
	s.TodoStep = TodoStepRepository{s}
	s.TodoView = TodoViewRepository{s}
	s.User = UserRepository{s}
	s.Workbench = WorkbenchQueries{s}
	return s
}
