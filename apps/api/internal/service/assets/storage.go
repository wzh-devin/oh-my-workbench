package assets

import (
	"context"
	"errors"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	s3dto "github.com/devin/oh-my-workbench/api/internal/domain/dto/s3"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	s3service "github.com/devin/oh-my-workbench/api/internal/service/s3"
)

func (s *Service) storageConfig(c repository.AssetConnection) (s3dto.Config, error) {
	access, secret, err := s.credentials(c)
	return s3dto.Config{Endpoint: c.Endpoint, Region: c.Region, Bucket: c.Bucket, AddressingStyle: c.AddressingStyle, AccessKey: access, SecretKey: secret}, err
}

func (s *Service) storage(ctx context.Context, c repository.AssetConnection) (*s3service.Client, error) {
	endpoint, err := s3service.EndpointURL(c.Endpoint)
	if err != nil || !s3service.ValidEndpoint(endpoint) {
		return nil, assetdomain.ErrEndpoint
	}
	config, err := s.storageConfig(c)
	if err != nil {
		return nil, err
	}
	client, err := s.objects.Client(ctx, c.UserID, config)
	return client, storageError(err)
}

func storageError(err error) error {
	var stage *s3service.StageError
	if errors.As(err, &stage) {
		return connectionCheckError(stage.Stage, storageError(stage.Err))
	}
	switch {
	case errors.Is(err, s3service.ErrEndpoint):
		return assetdomain.ErrEndpoint
	case errors.Is(err, s3service.ErrConflict):
		return assetdomain.ErrConflict
	case errors.Is(err, s3service.ErrInvalid):
		return assetdomain.ErrInvalid
	case errors.Is(err, s3service.ErrNotFound):
		return assetdomain.ErrNotFound
	default:
		return err
	}
}
