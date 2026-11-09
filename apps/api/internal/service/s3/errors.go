package s3

import "errors"

var (
	ErrInvalid  = errors.New("输入无效，请检查名称、目录和配置")
	ErrEndpoint = errors.New("存储地址不可用，请填写有效的 S3/MinIO 地址")
	ErrConflict = errors.New("记录已变化或操作正在进行，请重载后重试")
	ErrNotFound = errors.New("文件、目录或存储不可用")
)

type StageError struct {
	Stage string
	Err   error
}

func (e *StageError) Error() string { return e.Stage + ": " + e.Err.Error() }

func (e *StageError) Unwrap() error { return e.Err }
