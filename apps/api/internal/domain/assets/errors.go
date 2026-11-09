package assets

import "errors"

var (
	ErrInvalid            = errors.New("输入无效，请检查名称、目录和配置")
	ErrNotFound           = errors.New("文件、目录或存储不可用")
	ErrConflict           = errors.New("记录已变化或操作正在进行，请重载后重试")
	ErrExtension          = errors.New("不能修改文件后缀名")
	ErrName               = errors.New("同目录已存在同名文件或文件夹")
	ErrRule               = errors.New("视图规则无效或引用的存储、目录不可用，请编辑视图")
	ErrDisabled           = errors.New("工作台的凭证加密尚未就绪，请联系工作台管理员")
	ErrEndpoint           = errors.New("存储地址不可用，请填写有效的 S3/MinIO 地址")
	ErrPreviewUnavailable = errors.New("Office 预览服务暂不可用，请下载原文件")
	ErrConnectionCheck    = errors.New("存储连接检查未通过")
	ErrLastView           = errors.New("至少保留一个资产视图")
)

type UploadNameConflict struct {
	SuggestedName string `json:"suggestedName"`
}

func (e *UploadNameConflict) Error() string { return ErrName.Error() }

func (e *UploadNameConflict) Unwrap() error { return ErrName }
