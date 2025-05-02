package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	APIKey                string
	MaxConcurrentAnalyses int
	TempDirRoot           string
	MaxTempFileAge        time.Duration
	Host                  string
	Port                  int
	MaxUploadSizeBytes    int64
	AnalysisTimeout       time.Duration
}

func LoadConfig() (*Config, error) {
	err := godotenv.Load()
	if err != nil && !os.IsNotExist(err) {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	apiKey := os.Getenv("VAL_API_KEY")
	if apiKey == "" {
		log.Println("Warning: VAL_API_KEY not set. API access will be restricted if required by endpoints.")
	}

	maxConcurrentStr := os.Getenv("MAX_CONCURRENT_ANALYSES")
	if maxConcurrentStr == "" {
		maxConcurrentStr = "4"
	}
	maxConcurrent, err := strconv.Atoi(maxConcurrentStr)
	if err != nil || maxConcurrent <= 0 {
		return nil, fmt.Errorf("invalid MAX_CONCURRENT_ANALYSES: %w", err)
	}

	tempDirRoot := os.Getenv("TEMP_DIR_ROOT")
	if tempDirRoot == "" {
		tempDirRoot = filepath.Join(os.TempDir(), "bloop")
	}

	absTempDir, err := filepath.Abs(tempDirRoot)
	if err != nil {
		return nil, fmt.Errorf("failed to get absolute path for TEMP_DIR_ROOT: %w", err)
	}
	tempDirRoot = absTempDir

	maxAgeStr := os.Getenv("MAX_TEMP_FILE_AGE_SECONDS")
	if maxAgeStr == "" {
		maxAgeStr = "6000"
	}
	maxAgeSec, err := strconv.Atoi(maxAgeStr)
	if err != nil || maxAgeSec <= 0 {
		return nil, fmt.Errorf("invalid MAX_TEMP_FILE_AGE_SECONDS: %w", err)
	}

	host := os.Getenv("HOST")
	if host == "" {
		host = "0.0.0.0"
	}

	portStr := os.Getenv("PORT")
	if portStr == "" {
		portStr = "8000"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		return nil, fmt.Errorf("invalid PORT: %w", err)
	}

	maxSizeMbStr := os.Getenv("MAX_UPLOAD_SIZE_MB")
	if maxSizeMbStr == "" {
		maxSizeMbStr = "25"
	}
	maxSizeMb, err := strconv.Atoi(maxSizeMbStr)
	if err != nil || maxSizeMb <= 0 {
		return nil, fmt.Errorf("invalid MAX_UPLOAD_SIZE_MB: %w", err)
	}
	maxUploadSizeBytes := int64(maxSizeMb) * 1024 * 1024

	timeoutStr := os.Getenv("ANALYSIS_TIMEOUT_SECONDS")
	if timeoutStr == "" {
		timeoutStr = "120"
	}
	timeoutSec, err := strconv.Atoi(timeoutStr)
	if err != nil || timeoutSec <= 0 {
		return nil, fmt.Errorf("invalid ANALYSIS_TIMEOUT_SECONDS: %w", err)
	}

	return &Config{
		APIKey:                apiKey,
		MaxConcurrentAnalyses: maxConcurrent,
		TempDirRoot:           tempDirRoot,
		MaxTempFileAge:        time.Duration(maxAgeSec) * time.Second,
		Host:                  host,
		Port:                  port,
		MaxUploadSizeBytes:    maxUploadSizeBytes,
		AnalysisTimeout:       time.Duration(timeoutSec) * time.Second,
	}, nil
}
