package service

import (
	"context"
	"errors"
	"fmt"
	"net"

	minio "github.com/minio/minio-go/v7"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// 连接检查只返回阶段和可操作的错误，不把凭证或对象存储的原始响应暴露给界面。
func connectionCheckError(stage string, err error) error {
	if err == nil {
		return nil
	}
	detail := "操作失败，请重试"
	code := minio.ToErrorResponse(err).Code
	switch code {
	case "InvalidAccessKeyId":
		detail = "Access Key 不存在或已停用"
	case "SignatureDoesNotMatch":
		detail = "签名校验失败，请检查 Secret Key 和 Region"
	case "AccessDenied", "AllAccessDisabled":
		detail = "访问凭证没有此步骤所需的权限"
	case "NoSuchBucket":
		detail = "Bucket 不存在，请检查名称"
	case "AuthorizationHeaderMalformed", "PermanentRedirect", "IllegalLocationConstraintException":
		detail = "存储地址或 Region 不匹配"
	case "RequestTimeTooSkewed", "RequestExpired":
		detail = "工作台与存储服务的系统时间不一致"
	case "InvalidArgument", "NotImplemented":
		detail = "存储服务不支持此操作"
	default:
		var networkError net.Error
		switch {
		case errors.Is(err, context.DeadlineExceeded):
			detail = "连接超时，请检查存储地址"
		case errors.As(err, &networkError):
			detail = "无法连接存储地址，请检查网络和端口"
		case errors.Is(err, assetdomain.ErrNotFound):
			detail = "Bucket 不存在，请检查名称"
		case errors.Is(err, assetdomain.ErrDisabled):
			detail = "无法读取已保存的凭证，请重新保存连接"
		case errors.Is(err, assetdomain.ErrEndpoint):
			detail = assetdomain.ErrEndpoint.Error()
		case errors.Is(err, assetdomain.ErrInvalid):
			detail = "读取内容与写入内容不一致"
		}
	}
	if code != "" {
		detail += "（" + code + "）"
	}
	return fmt.Errorf("%w：%s：%s", assetdomain.ErrConnectionCheck, stage, detail)
}
