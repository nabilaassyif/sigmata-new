package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/url"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const maxPhotoBytes = 5 << 20

type photoStore struct {
	client *minio.Client
	bucket string
}

func newPhotoStore(endpoint, region, accessKey, secretKey, bucket string) (*photoStore, error) {
	if endpoint == "" || accessKey == "" || secretKey == "" || bucket == "" || region == "" {
		return nil, errors.New("garage endpoint, region, credentials and bucket are required")
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" {
		return nil, errors.New("invalid garage endpoint")
	}
	client, err := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(accessKey, secretKey, ""), Secure: u.Scheme == "https", Region: region, BucketLookup: minio.BucketLookupPath})
	if err != nil {
		return nil, err
	}
	return &photoStore{client: client, bucket: bucket}, nil
}

func (s *photoStore) put(ctx context.Context, key string, data []byte, mime string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{ContentType: mime})
	return err
}

func (s *photoStore) get(ctx context.Context, key string) ([]byte, error) {
	if !strings.HasPrefix(key, "complaints/") {
		return nil, errors.New("invalid object key")
	}
	object, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer object.Close()
	data, err := io.ReadAll(io.LimitReader(object, maxPhotoBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxPhotoBytes {
		return nil, errors.New("image too large")
	}
	return data, nil
}

func (s *photoStore) remove(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}
