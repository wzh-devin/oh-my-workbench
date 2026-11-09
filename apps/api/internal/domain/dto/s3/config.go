package s3

type Config struct {
	Endpoint, Region, Bucket, AddressingStyle string
	AccessKey, SecretKey                      string
}
