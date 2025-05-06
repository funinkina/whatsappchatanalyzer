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
	Host                  string
	Port                  int
	MaxConcurrentAnalyses int
	MaxConcurrentAICalls  int
	AIQueueTimeout        time.Duration
	TempDirRoot           string
	MaxTempFileAge        time.Duration
	MaxUploadSizeBytes    int64
	AnalysisTimeout       time.Duration
	APIKey                string
	OpenAIAPIKey          string
}

func LoadConfig() (*Config, error) {
	err := godotenv.Load()
	if err != nil && !os.IsNotExist(err) {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	apiKey := os.Getenv("VAL_API_KEY")
	if apiKey == "" {
		log.Println("Warning: VAL_API_KEY not set. API key protection will be disabled if configured.")
	}

	tempDirRoot := os.Getenv("TEMP_DIR_ROOT")
	if tempDirRoot == "" {
		tempDirRoot = filepath.Join(os.TempDir(), "bloop")
	}

	absTempDir, err := filepath.Abs(tempDirRoot)
	if err != nil {
		return nil, fmt.Errorf("failed to get absolute path for TEMP_DIR_ROOT '%s': %w", tempDirRoot, err)
	}
	tempDirRoot = absTempDir

	maxAgeStr := os.Getenv("MAX_TEMP_FILE_AGE_SECONDS")
	if maxAgeStr == "" {
		maxAgeStr = "6000"
	}
	maxAgeSec, err := strconv.Atoi(maxAgeStr)
	if err != nil || maxAgeSec <= 0 {
		log.Printf("Warning: Invalid MAX_TEMP_FILE_AGE_SECONDS value '%s'. Using default 86400. Error: %v", maxAgeStr, err)
		maxAgeSec = 86400
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
		log.Printf("Warning: Invalid PORT value '%s'. Using default 8000. Error: %v", portStr, err)
		port = 8000
	}

	maxSizeMbStr := os.Getenv("MAX_UPLOAD_SIZE_MB")
	if maxSizeMbStr == "" {
		maxSizeMbStr = "25"
	}
	maxSizeMb, err := strconv.Atoi(maxSizeMbStr)
	if err != nil || maxSizeMb <= 0 {
		log.Printf("Warning: Invalid MAX_UPLOAD_SIZE_MB value '%s'. Using default 25. Error: %v", maxSizeMbStr, err)
		maxSizeMb = 25
	}
	maxUploadSizeBytes := int64(maxSizeMb) * 1024 * 1024

	analysisTimeoutStr := os.Getenv("ANALYSIS_TIMEOUT_SECONDS")
	if analysisTimeoutStr == "" {
		analysisTimeoutStr = "300"
	}
	analysisTimeoutSec, err := strconv.Atoi(analysisTimeoutStr)
	if err != nil || analysisTimeoutSec <= 0 {
		log.Printf("Warning: Invalid ANALYSIS_TIMEOUT_SECONDS value '%s'. Using default 300. Error: %v", analysisTimeoutStr, err)
		analysisTimeoutSec = 300
	}

	maxConcurrentAICallsStr := os.Getenv("MAX_CONCURRENT_AI_CALLS")
	if maxConcurrentAICallsStr == "" {
		maxConcurrentAICallsStr = "5"
	}
	maxConcurrentAICalls, err := strconv.Atoi(maxConcurrentAICallsStr)
	if err != nil || maxConcurrentAICalls <= 0 {
		log.Printf("Warning: Invalid MAX_CONCURRENT_AI_CALLS value '%s'. Using default 3. Error: %v", maxConcurrentAICallsStr, err)
		maxConcurrentAICalls = 3
	}

	aiQueueTimeoutStr := os.Getenv("AI_QUEUE_TIMEOUT_SECONDS")
	if aiQueueTimeoutStr == "" {
		aiQueueTimeoutStr = "20"
	}
	aiQueueTimeoutSec, err := strconv.Atoi(aiQueueTimeoutStr)
	if err != nil || aiQueueTimeoutSec < 0 {
		log.Printf("Warning: Invalid AI_QUEUE_TIMEOUT_SECONDS value '%s'. Using default 20. Error: %v", aiQueueTimeoutStr, err)
		aiQueueTimeoutSec = 20
	}

	return &Config{
		Host:                 host,
		Port:                 port,
		MaxConcurrentAICalls: maxConcurrentAICalls,
		AIQueueTimeout:       time.Duration(aiQueueTimeoutSec) * time.Second,
		TempDirRoot:          tempDirRoot,
		MaxTempFileAge:       time.Duration(maxAgeSec) * time.Second,
		MaxUploadSizeBytes:   maxUploadSizeBytes,
		AnalysisTimeout:      time.Duration(analysisTimeoutSec) * time.Second,
		APIKey:               apiKey,
	}, nil
}
