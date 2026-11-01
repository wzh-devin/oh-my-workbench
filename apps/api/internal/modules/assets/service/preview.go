package service

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/proxy"

	minio "github.com/minio/minio-go/v7"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
	assetrepo "github.com/devin/oh-my-workbench/api/internal/modules/assets/repository"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
)

// Office 仅送入工作台私有转换器，产物按不可变内容和渲染版本复用。
func (s *Service) Preview(ctx context.Context, userID, id int64, create bool) (assetdomain.Preview, error) {
	e, b, _, err := s.repo.Content(ctx, userID, id)
	if err != nil {
		return assetdomain.Preview{}, err
	}
	if assetdomain.OfficeFilename(e) == "" || b.SizeBytes > 50<<20 {
		return assetdomain.Preview{}, fmt.Errorf("%w：Office 预览最大 50 MiB", assetdomain.ErrInvalid)
	}
	if create {
		cached, err := s.repo.Preview(ctx, userID, b.ID, false)
		if err == nil && cached.Status == "ready" {
			return cached, nil
		}
		if err != nil && !errors.Is(err, assetdomain.ErrNotFound) {
			return assetdomain.Preview{}, err
		}
		// 转换器未启动时立即提供下载，不让用户等待多轮后台重试。
		checkCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		request, err := http.NewRequestWithContext(checkCtx, http.MethodGet, s.converterURL+"/health", nil)
		if err != nil {
			return assetdomain.Preview{}, assetdomain.ErrPreviewUnavailable
		}
		gateway, err := s.converterHTTPClient(checkCtx, userID)
		if err != nil {
			return assetdomain.Preview{}, assetdomain.ErrPreviewUnavailable
		}
		response, err := gateway.Do(request)
		if err != nil {
			return assetdomain.Preview{}, assetdomain.ErrPreviewUnavailable
		}
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			return assetdomain.Preview{}, assetdomain.ErrPreviewUnavailable
		}
	}
	return s.repo.Preview(ctx, userID, b.ID, create)
}

func (s *Service) converterHTTPClient(ctx context.Context, userID int64) (*http.Client, error) {
	return s.routes.Client(ctx, userID, outbound.Converter, func(dialer proxy.ContextDialer) *http.Client {
		transport := s.converterClient.Transport.(*http.Transport).Clone()
		transport.DialContext = dialer.DialContext
		return &http.Client{Transport: transport, Timeout: s.converterClient.Timeout, CheckRedirect: s.converterClient.CheckRedirect}
	})
}

func (s *Service) convertPreview(ctx context.Context, preview assetdomain.Preview) error {
	p, e, err := s.repo.ClaimPreview(ctx, preview)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 85*time.Second)
	defer cancel()
	b, err := s.repo.Blob(ctx, p.UserID, p.BlobID)
	if err != nil {
		return err
	}
	c, err := s.repo.Connection(ctx, p.UserID, b.ConnectionID)
	if err != nil {
		return err
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		return err
	}
	// 重启后优先找回已写出的产物，避免成功响应丢失后重复转换。
	if info, err := client.StatObject(ctx, c.Bucket, p.ObjectKey, minio.StatObjectOptions{}); err == nil && info.Size > 0 && info.Size <= 100<<20 {
		return s.repo.FinishPreview(ctx, p, info.Size, info.VersionID, "")
	}
	source, err := client.GetObject(ctx, c.Bucket, b.ObjectKey, minio.GetObjectOptions{VersionID: b.ObjectVersionID})
	if err != nil {
		return err
	}
	defer source.Close()
	reader, writer := io.Pipe()
	form := multipart.NewWriter(writer)
	go func() {
		part, err := form.CreateFormFile("files", assetdomain.OfficeFilename(e))
		if err == nil {
			_, err = io.Copy(part, io.LimitReader(source, 50<<20+1))
		}
		if err == nil {
			err = form.Close()
		}
		_ = writer.CloseWithError(err)
	}()
	defer reader.Close()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.converterURL+"/forms/libreoffice/convert", reader)
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", form.FormDataContentType())
	gateway, err := s.converterHTTPClient(ctx, p.UserID)
	var response *http.Response
	if err == nil {
		response, err = gateway.Do(request)
	}
	fail := func() error {
		saveCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer stop()
		return s.repo.FinishPreview(saveCtx, p, 0, "", "Office 转换失败，请重试或下载原文件")
	}
	if err != nil {
		return fail()
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(response.Header.Get("Content-Type"), "application/pdf") {
		return fail()
	}
	buffered := bufio.NewReader(response.Body)
	head, err := buffered.Peek(5)
	if err != nil || !bytes.Equal(head, []byte("%PDF-")) {
		return fail()
	}
	// 旧写入租约已到期；重试前回收该Key残留的未完成分片。
	if err := client.abortKey(ctx, c, p.ObjectKey); err != nil {
		return fail()
	}
	// 读到超限字节就返回流错误，让 SDK 终止分片，不能缓存截断的 PDF。
	pdfReader, pdfWriter := io.Pipe()
	defer pdfReader.Close()
	go func() {
		written, err := io.Copy(pdfWriter, io.LimitReader(buffered, 100<<20+1))
		if err == nil && written > 100<<20 {
			err = assetdomain.ErrInvalid
		}
		_ = pdfWriter.CloseWithError(err)
	}()
	info, err := client.PutObject(ctx, c.Bucket, p.ObjectKey, pdfReader, -1, minio.PutObjectOptions{ContentType: "application/pdf", PartSize: 8 << 20, NumThreads: 1})
	if err != nil || info.Size > 100<<20 {
		saveCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer stop()
		return s.repo.FinishPreviewResult(saveCtx, p, 0, "", "保存文档预览失败，将自动重试", assetrepo.PreviewWriteUnknown)
	}
	return s.repo.FinishPreview(ctx, p, info.Size, info.VersionID, "")
}
