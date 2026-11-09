package assets

import (
	"strconv"

	assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"
	assetresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/assets"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

func fromBase(v repository.AssetBase) assetresp.BaseResponse {
	return assetresp.BaseResponse{ID: v.ID, CreatedAt: v.CreatedAt, UpdatedAt: v.UpdatedAt}
}

func fromConnection(v repository.AssetConnection) assetresp.ConnectionResponse {
	return assetresp.ConnectionResponse{
		BaseResponse:    fromBase(v.AssetBase),
		Name:            v.Name,
		Endpoint:        v.Endpoint,
		PublicEndpoint:  v.PublicEndpoint,
		AddressingStyle: v.AddressingStyle,
		Region:          v.Region,
		Bucket:          v.Bucket,
		Prefix:          v.Prefix,
		Enabled:         v.Enabled,
		LastCheckedAt:   v.LastCheckedAt,
		LastError:       v.LastError,
		Version:         v.Version,
		Status:          v.Status,
	}
}

func fromConnectionStats(v assetdto.ConnectionStats) assetresp.ConnectionStatsResponse {
	return assetresp.ConnectionStatsResponse{ID: v.ID, Total: v.Total, Size: v.Size}
}

func fromContentAccess(v assetdto.ContentAccess) assetresp.ContentAccessResponse {
	return assetresp.ContentAccessResponse{URL: v.URL, ExpiresAt: v.ExpiresAt, CacheKey: v.CacheKey}
}

func fromEntry(v repository.AssetEntry) assetresp.EntryResponse {
	out := assetresp.EntryResponse{
		BaseResponse: fromBase(v.AssetBase),
		ConnectionID: v.ConnectionID,
		ParentID:     nil,
		Kind:         v.Kind,
		Name:         v.Name,
		ContentType:  v.ContentType,
		Starred:      v.Starred,
		LastOpenedAt: v.LastOpenedAt,
		TrashedAt:    v.TrashedAt,
		Version:      v.Version,
		LegacyID:     v.LegacyID,
		Size:         v.Size,
		FileCount:    v.FileCount,
		Hidden:       v.Hidden,
		Origin:       "remote",
		Thumbnail:    nil,
	}
	if v.ParentID != nil {
		value := strconv.FormatInt(*v.ParentID, 10)
		out.ParentID = &value
	}
	if v.Thumbnail != nil {
		value := fromThumbnail(*v.Thumbnail)
		out.Thumbnail = &value
	}
	return out
}

func fromOperation(v repository.AssetOperation) assetresp.OperationResponse {
	return assetresp.OperationResponse{BaseResponse: fromBase(v.AssetBase), Kind: v.Kind, Status: v.Status, RequestKey: v.RequestKey, LastError: v.LastError}
}

func fromPart(v repository.AssetUploadPart) assetresp.UploadPartResponse {
	return assetresp.UploadPartResponse{BaseResponse: fromBase(v.AssetBase), PartNumber: v.PartNumber, SizeBytes: v.SizeBytes, SHA256: v.SHA256, Status: v.Status}
}

func fromPreview(v repository.AssetPreview) assetresp.PreviewResponse {
	return assetresp.PreviewResponse{BaseResponse: fromBase(v.AssetBase), RendererVersion: v.RendererVersion, Status: v.Status, SizeBytes: v.SizeBytes, LastError: v.LastError}
}

func fromQueryResult(v repository.AssetPage) assetresp.EntryPageResponse {
	return assetresp.EntryPageResponse{Entries: mapSlice(v.Entries, fromEntry), Total: v.Total, NextCursor: v.NextCursor, HasMore: v.HasMore}
}

func fromStatistics(v assetdto.Statistics) assetresp.StatisticsResponse {
	return assetresp.StatisticsResponse{
		Total:     v.Total,
		Size:      v.Size,
		Images:    v.Images,
		Documents: v.Documents,
		Daily:     v.Daily,
		Storage:   mapSlice(v.Storage, fromConnectionStats),
	}
}

func fromThumbnail(v assetdto.Thumbnail) assetresp.ThumbnailResponse {
	return assetresp.ThumbnailResponse{Status: v.Status, Version: v.Version}
}

func fromUpload(v repository.AssetUpload) assetresp.UploadResponse {
	out := assetresp.UploadResponse{
		BaseResponse:   fromBase(v.AssetBase),
		ConnectionID:   v.ConnectionID,
		ParentID:       v.ParentID,
		FileName:       v.FileName,
		ContentType:    v.ContentType,
		ExpectedSHA256: v.ExpectedSHA256,
		SizeBytes:      v.SizeBytes,
		PartSize:       v.PartSize,
		PartCount:      v.PartCount,
		RequestKey:     v.RequestKey,
		Status:         v.Status,
		ExpiresAt:      v.ExpiresAt,
		LastError:      v.LastError,
		Version:        v.Version,
		Parts:          mapSlice(v.Parts, fromPart),
		Entry:          nil,
	}
	if v.Entry != nil {
		value := fromEntry(*v.Entry)
		out.Entry = &value
	}
	return out
}

func fromView(v repository.AssetView) assetresp.ViewResponse {
	return assetresp.ViewResponse{
		BaseResponse: fromBase(v.AssetBase),
		Name:         v.Name,
		Icon:         v.Icon,
		BuiltinKey:   v.BuiltinKey,
		FilterQuery:  v.FilterQuery,
		Sort:         v.Sort,
		Version:      v.Version,
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

func fromThumbnailPointer(v *assetdto.Thumbnail) *assetresp.ThumbnailResponse {
	if v == nil {
		return nil
	}
	out := fromThumbnail(*v)
	return &out
}
