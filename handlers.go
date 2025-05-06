package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func healthCheckHandler(c *gin.Context) {
	pending := config.MaxConcurrentAnalyses - len(analysisSemaphore)

	c.JSON(http.StatusOK, gin.H{
		"status":           "ok",
		"pending_analyses": pending,
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

	var tempFilePath string

	defer func() {
		if tempFilePath != "" {
			err := os.Remove(tempFilePath)
			if err != nil && !os.IsNotExist(err) {
				log.Printf("%s Error removing temporary file %s in defer: %v. Will be cleaned up later.", logPrefix, tempFilePath, err)
			} else if err == nil {
				// log.Printf("%s Successfully removed temporary file: %s", logPrefix, tempFilePath)
			}
		}
	}()

	// get semaphore
	// log.Printf("%s Attempting to acquire analysis semaphore (%d available)...", logPrefix, config.MaxConcurrentAnalyses-len(analysisSemaphore))
	acquireCtx, acquireCancel := context.WithTimeout(c.Request.Context(), 30*time.Second) // Use request context as base
	defer acquireCancel()

	select {
	case analysisSemaphore <- struct{}{}:
		// log.Printf("%s Analysis semaphore acquired (%d available).", logPrefix, config.MaxConcurrentAnalyses-len(analysisSemaphore))

		defer func() {
			<-analysisSemaphore
			// log.Printf("%s Analysis semaphore released (%d available).", logPrefix, config.MaxConcurrentAnalyses-len(analysisSemaphore)+1)
		}()
	case <-acquireCtx.Done():

		log.Printf("%s Could not acquire analysis semaphore within 30s: %v", logPrefix, acquireCtx.Err())
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"detail": "Server is busy, please try again later."})
		return
	}

	// save upload temporarily
	uploadedFile, err := fileHeader.Open()
	if err != nil {
		log.Printf("%s Error opening uploaded file header: %v", logPrefix, err)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": "Server error: Failed to open uploaded file."})
		return
	}
	defer uploadedFile.Close()

	tempFile, err := os.CreateTemp(config.TempDirRoot, "upload_*.txt")
	if err != nil {
		log.Printf("%s Error creating temporary file: %v", logPrefix, err)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": "Server error: Failed to create temporary storage."})
		return
	}
	tempFilePath = tempFile.Name()
	defer tempFile.Close()

	bytesWritten, err := io.Copy(tempFile, uploadedFile)
	if err != nil {
		log.Printf("%s Error saving uploaded file to %s: %v", logPrefix, tempFilePath, err)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": "Server error: Failed to save chat file."})
		return
	}

	if err := tempFile.Close(); err != nil {
		log.Printf("%s Error closing temporary file %s after writing: %v", logPrefix, tempFilePath, err)
	}

	if bytesWritten == 0 {
		log.Printf("%s Uploaded file appears to be empty.", logPrefix)
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"detail": "Uploaded file is empty."})
		return
	}

	// log.Printf("%s Saved uploaded file to temporary path: %s (%.2f MB)", logPrefix, tempFilePath, float64(bytesWritten)/(1024*1024))

	// log.Printf("%s Starting analysis (Timeout: %s)...", logPrefix, config.AnalysisTimeout)
	analysisCtx, analysisCancel := context.WithTimeout(c.Request.Context(), config.AnalysisTimeout)
	defer analysisCancel()

	results, err := AnalyzeChat(analysisCtx, tempFilePath, filename)

	// handle result/error
	if err != nil {
		log.Printf("%s Analysis function failed: %v", logPrefix, err)
		if err == context.DeadlineExceeded {
			log.Printf("%s Analysis timed out after %s.", logPrefix, config.AnalysisTimeout)
			c.AbortWithStatusJSON(http.StatusGatewayTimeout, gin.H{"detail": fmt.Sprintf("Analysis processing timed out after %s.", config.AnalysisTimeout)})
		} else if err == context.Canceled {
			log.Printf("%s Analysis canceled, possibly due to client disconnect.", logPrefix)
			c.Abort()
		} else {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": fmt.Sprintf("Analysis failed: %s", err.Error())})
		}
		return
	}

	if results != nil && results.Error != "" {
		log.Printf("%s Analysis completed with internal errors: %s", logPrefix, results.Error)
		c.JSON(http.StatusOK, results)
		return
	}

	select {
	case <-analysisCtx.Done():
		log.Printf("%s Analysis context ended: %v", logPrefix, analysisCtx.Err())
		if analysisCtx.Err() == context.DeadlineExceeded {
			log.Printf("%s Analysis timed out after %s.", logPrefix, config.AnalysisTimeout)
			c.AbortWithStatusJSON(http.StatusGatewayTimeout, gin.H{"detail": fmt.Sprintf("Analysis processing timed out after %s.", config.AnalysisTimeout)})
		} else if analysisCtx.Err() == context.Canceled {

			log.Printf("%s Analysis canceled.", logPrefix)
			c.AbortWithStatus(http.StatusRequestTimeout)
		} else {

			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"detail": "Analysis context error."})
		}
		return
	default:
	}

	// log.Printf("%s Analysis completed successfully.", logPrefix)
	c.JSON(http.StatusOK, results)
}
