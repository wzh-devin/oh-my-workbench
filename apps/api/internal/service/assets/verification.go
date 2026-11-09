package assets

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"

	"github.com/gabriel-vasile/mimetype"
	minio "github.com/minio/minio-go/v7"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	s3service "github.com/devin/oh-my-workbench/api/internal/service/s3"
)

func verifyContent(ctx context.Context, client *s3service.Client, c repository.AssetConnection, b repository.AssetBlob, u repository.AssetUpload) (minio.ObjectInfo, string, string, error) {
	info, err := client.StatObject(ctx, c.Bucket, b.ObjectKey, minio.StatObjectOptions{VersionID: b.ObjectVersionID})
	if err != nil {
		return info, "", "", err
	}
	if info.Size != u.SizeBytes {
		return info, "", "", assetdomain.ErrInvalid
	}
	object, err := client.GetObject(ctx, c.Bucket, b.ObjectKey, minio.GetObjectOptions{VersionID: info.VersionID})
	if err != nil {
		return info, "", "", err
	}
	defer object.Close()
	hash := sha256.New()
	head := make([]byte, 3072)
	n, err := io.ReadFull(object, head)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return info, "", "", err
	}
	_, _ = hash.Write(head[:n])
	written, err := io.Copy(hash, io.LimitReader(object, assetdomain.MaxFileSize+1))
	if err != nil {
		return info, "", "", err
	}
	if written+int64(n) != u.SizeBytes {
		return info, "", "", assetdomain.ErrInvalid
	}
	digest := hex.EncodeToString(hash.Sum(nil))
	if digest != u.ExpectedSHA256 {
		return info, "", "", fmt.Errorf("%w：文件指纹与实际内容不一致", assetdomain.ErrInvalid)
	}
	contentType := mimetype.Detect(head[:n]).String()
	return info, digest, contentType, nil
}
