package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type inferenceClient struct {
	baseURL string
	http    *http.Client
}

type inferenceRequest struct {
	ComplaintID       string         `json:"complaintId"`
	MunicipalityID    string         `json:"municipalityId"`
	Description       string         `json:"description"`
	GeospatialContext map[string]any `json:"geospatialContext,omitempty"`
}

type inferenceResponse struct {
	ComplaintID            string   `json:"complaintId"`
	PredictedCategoryID    *string  `json:"predictedCategoryId"`
	PredictedAgencyID      *string  `json:"predictedAgencyId"`
	PredictedCategoryLabel *string  `json:"predictedCategoryLabel"`
	PredictedAgencyLabel   *string  `json:"predictedAgencyLabel"`
	Confidence             *float64 `json:"confidence"`
	ModelVersion           *string  `json:"modelVersion"`
	InferenceLatencyMs     *float64 `json:"inferenceLatencyMs"`
	RequiresHumanReview    bool     `json:"requiresHumanReview"`
	FallbackUsed           bool     `json:"fallbackUsed"`
	DecisionReason         string   `json:"decisionReason"`
}

func newInferenceClient(url string) *inferenceClient {
	return &inferenceClient{baseURL: strings.TrimRight(url, "/"), http: &http.Client{Timeout: 120 * time.Second}}
}

func (c *inferenceClient) predict(ctx context.Context, input inferenceRequest) (inferenceResponse, error) {
	var result inferenceResponse
	if c.baseURL == "" {
		return result, errors.New("inference URL is not configured")
	}
	body, err := json.Marshal(input)
	if err != nil {
		return result, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/inference/predict", bytes.NewReader(body))
	if err != nil {
		return result, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return result, fmt.Errorf("inference returned status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 65536)).Decode(&result); err != nil {
		return result, err
	}
	if result.ComplaintID != input.ComplaintID {
		return inferenceResponse{}, errors.New("inference complaint ID mismatch")
	}
	if !result.RequiresHumanReview {
		return inferenceResponse{}, errors.New("inference response omitted required review")
	}
	return result, nil
}

func (b *bff) predictPreview(w http.ResponseWriter, r *http.Request) {
	if b.inference == nil {
		http.Error(w, "inference unavailable", http.StatusServiceUnavailable)
		return
	}
	var input inferenceRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 65536))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	result, err := b.inference.predict(r.Context(), input)
	if err != nil {
		http.Error(w, "inference unavailable", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(result)
}
