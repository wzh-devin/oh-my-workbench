package mail

import (
	maildto "github.com/devin/oh-my-workbench/api/internal/domain/dto/mail"
	mailresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/mail"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

func fromAccount(v repository.MailAccount) mailresp.AccountResponse {
	return mailresp.AccountResponse{
		RecordResponse: fromRecord(v.MailRecord),
		Name:           v.Name,
		Provider:       v.Provider,
		Email:          v.Email,
		Enabled:        v.Enabled,
		NotifyEnabled:  v.NotifyEnabled,
		Version:        v.Version,
		LastSyncAt:     v.LastSyncAt,
		LastError:      v.LastError,
	}
}

func fromAccountView(v repository.MailAccountView) mailresp.AccountDetailResponse {
	return mailresp.AccountDetailResponse{
		AccountResponse: fromAccount(v.MailAccount),
		Status:          v.Status,
		Unread:          v.Unread,
		Total:           v.Total,
		Host:            v.Host,
		Port:            v.Port,
		TLS:             v.TLS,
		Syncing:         v.Syncing,
	}
}

func fromAttachment(v repository.MailAttachment) mailresp.AttachmentResponse {
	return mailresp.AttachmentResponse{RecordResponse: fromRecord(v.MailRecord), Filename: v.Filename, ContentType: v.ContentType, SizeBytes: v.SizeBytes}
}

func fromBulkResult(v maildto.BulkResult) mailresp.BulkMessagesResponse {
	return mailresp.BulkMessagesResponse{Affected: v.Affected}
}

func fromMessage(v repository.MailMessage) mailresp.MessageResponse {
	return mailresp.MessageResponse{
		RecordResponse:  fromRecord(v.MailRecord),
		AccountID:       v.AccountID,
		Sender:          v.Sender,
		Address:         v.Address,
		Subject:         v.Subject,
		Preview:         v.Preview,
		BodyText:        v.BodyText,
		BodyHTML:        v.BodyHTML,
		ReceivedAt:      v.ReceivedAt,
		SizeBytes:       v.SizeBytes,
		IsRead:          v.IsRead,
		IsStarred:       v.IsStarred,
		IsArchived:      v.IsArchived,
		AttachmentCount: v.AttachmentCount,
		Version:         v.Version,
	}
}

func fromMessageView(v repository.MailMessageView) mailresp.MessageDetailResponse {
	return mailresp.MessageDetailResponse{MessageResponse: fromMessage(v.MailMessage), Attachments: mapSlice(v.Attachments, fromAttachment), TodoID: v.TodoID}
}

func fromNotification(v repository.MailNotification) mailresp.NotificationResponse {
	return mailresp.NotificationResponse{RecordResponse: fromRecord(v.MailRecord), MessageID: v.MessageID, ReadAt: v.ReadAt}
}

func fromNotificationView(v repository.MailNotificationView) mailresp.NotificationDetailResponse {
	return mailresp.NotificationDetailResponse{NotificationResponse: fromNotification(v.MailNotification), Subject: v.Subject, Sender: v.Sender}
}

func fromQueryResult(v repository.MailPage) mailresp.MessagePageResponse {
	return mailresp.MessagePageResponse{Messages: mapSlice(v.Messages, fromMessage), Total: v.Total, NextAfter: v.NextAfter}
}

func fromRecord(v repository.MailRecord) mailresp.RecordResponse {
	return mailresp.RecordResponse{ID: v.ID, CreatedAt: v.CreatedAt, UpdatedAt: v.UpdatedAt}
}

func fromSyncJob(v repository.MailSyncJob) mailresp.SyncJobResponse {
	return mailresp.SyncJobResponse{
		RecordResponse: fromRecord(v.MailRecord),
		AccountID:      v.AccountID,
		Trigger:        v.Trigger,
		Status:         v.Status,
		ProcessedCount: v.ProcessedCount,
		StartedAt:      v.StartedAt,
		FinishedAt:     v.FinishedAt,
		LastError:      v.LastError,
	}
}

func mapSlice[T, U any](values []T, convert func(T) U) []U {
	if values == nil {
		return nil
	}
	out := make([]U, len(values))
	for i, v := range values {
		out[i] = convert(v)
	}
	return out
}
