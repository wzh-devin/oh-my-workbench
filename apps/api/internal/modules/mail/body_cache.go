// 旧正文缓存后台升级；阅读请求不等待远端邮箱，也不创建无界任务。
package mail

import (
	"context"
	"log"
	"time"
)

// queueBodyRefresh 只排队记录标识，同一邮件去重；队列满时保留缓存供下次重试。
func (s *Service) queueBodyRefresh(record Record) {
	if _, loaded := s.bodyRefreshPending.LoadOrStore(record.ID, struct{}{}); loaded {
		return
	}
	select {
	case s.bodyRefresh <- record:
	default:
		s.bodyRefreshPending.Delete(record.ID)
	}
}

// refreshCachedBodies 由 Run 管理单个消费者，服务关闭会取消正在进行的 IMAP I/O。
func (s *Service) refreshCachedBodies(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case record := <-s.bodyRefresh:
			s.refreshCachedBody(ctx, record)
		}
	}
}

// refreshCachedBody 重新确认所有权和缓存版本；失败不删除正文或标记升级成功。
func (s *Service) refreshCachedBody(parent context.Context, record Record) {
	defer s.bodyRefreshPending.Delete(record.ID)
	ctx, cancel := context.WithTimeout(parent, 45*time.Second)
	defer cancel()
	view, err := s.repository.message(ctx, record.UserID, record.ID)
	if err != nil || view.BodyFetchedAt == nil || view.BodyFormatVersion >= bodyFormatVersion {
		return
	}
	body, err := s.fetchBody(ctx, record.UserID, view.Message)
	if err == nil {
		err = s.repository.cacheBody(ctx, record.UserID, record.ID, body)
	}
	if err != nil && ctx.Err() == nil {
		log.Printf("邮件正文缓存升级失败: message=%d", record.ID)
	}
}
