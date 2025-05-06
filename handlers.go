package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic" // Added for reading activeAICallsCount

	"github.com/gin-gonic/gin"
)

var ErrAIQueueTimeout = errors.New("AI analysis queue is full, server is busy")

func healthCheckHandler(c *gin.Context) {
	queuedAITasks := len(aiTaskQueue)
	maxConcurrentAITasks := cap(aiTaskQueue)
	processingAITasks := atomic.LoadInt32(&activeAICallsCount)

	c.JSON(http.StatusOK, gin.H{
		"status":                   "ok",
		"ai_tasks_queued":          queuedAITasks,
		"ai_tasks_processing":      processingAITasks,
		"ai_tasks_worker_capacity": maxConcurrentAITasks,
	})
}

func analyzeHandler(c *gin.Context) {
	clientHost := c.ClientIP()
	logPrefix := fmt.Sprintf("[Req from %s]", clientHost)

	// get file header
	fileHeader, err := c.FormFile("file")
	if err != nil {
		log.Printf("%s Error getting form file: %v", logPrefix, err)
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"detail": "Could not get file from request"})
		return
	}

	filename := fileHeader.Filename
	logPrefix = fmt.Sprintf("[Req from %s | File: %s]", clientHost, filename)
	log.Printf("%s Received analysis request. Content-Type: %s", logPrefix, fileHeader.Header.Get("Content-Type"))

	// validate filename
	if filename == "" {
		log.Printf("%s Filename is empty.", logPrefix)
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"detail": "Filename cannot be empty."})
		return
	}
	if !strings.HasSuffix(strings.ToLower(filename), ".txt") {
		log.Printf("%s Invalid file extension: %s", logPrefix, filename)
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"detail": "Invalid file extension. Please upload a .txt file."})
		return
	}

	uploadedFile, err := fileHeader.Open()
	if err != nil {
		log.Printf("%s Error opening uploaded file header: %v", logPrefix, err)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": "Server error: Failed to open uploaded file."})
		return
	}
	defer uploadedFile.Close()

	analysisCtx, analysisCancel := context.WithTimeout(c.Request.Context(), config.AnalysisTimeout)
	defer analysisCancel()

	results, err := AnalyzeChat(analysisCtx, uploadedFile, filename, aiTaskQueue, config.AIQueueTimeout)

	if err != nil {
		if errors.Is(err, ErrAIQueueTimeout) {
			log.Printf("%s AI Queue Timeout: %v", logPrefix, err)
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"detail": fmt.Sprintf("Server is busy processing AI requests, please try again later. (Queue wait > %s)", config.AIQueueTimeout)})
			return
		}

		log.Printf("%s AnalyzeChat setup/preprocessing failed: %v", logPrefix, err)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": fmt.Sprintf("Analysis setup failed: %s", err.Error())})
		return
	}

	select {
	case <-analysisCtx.Done():
		log.Printf("%s Analysis context ended after AnalyzeChat returned: %v", logPrefix, analysisCtx.Err())

		if errors.Is(analysisCtx.Err(), context.DeadlineExceeded) {
			c.AbortWithStatusJSON(http.StatusGatewayTimeout, gin.H{"detail": fmt.Sprintf("Analysis processing timed out after %s.", config.AnalysisTimeout)})
		} else {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": "Analysis context error after processing."})
		}
		return
	default:
	}

	if results != nil && results.Error != "" {
		log.Printf("%s Analysis completed with internal errors: %s", logPrefix, results.Error)
		c.JSON(http.StatusOK, results)
		return
	}

	if results != nil {
		log.Printf("%s Analysis successful.", logPrefix)
		c.JSON(http.StatusOK, results)
	} else {
		log.Printf("%s Analysis returned nil result and nil error unexpectedly.", logPrefix)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": "Analysis failed unexpectedly."})
	}
}
