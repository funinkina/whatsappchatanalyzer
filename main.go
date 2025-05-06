package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"sync/atomic" // Added for activeAICallsCount
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

var (
	config             *Config
	aiTaskQueue        chan aiTask
	aiWorkerWg         sync.WaitGroup
	activeAICallsCount int32 // New: counter for active AI calls
)

func main() {
	var err error
	config, err = LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	aiTaskQueue = make(chan aiTask, config.MaxConcurrentAICalls)

	log.Printf("Starting %d AI worker goroutines...", config.MaxConcurrentAICalls)
	aiWorkerWg.Add(config.MaxConcurrentAICalls)
	for i := 0; i < config.MaxConcurrentAICalls; i++ {
		go aiWorker(i, aiTaskQueue, &aiWorkerWg)
	}
	log.Printf("AI workers started.")

	err = os.MkdirAll(config.TempDirRoot, 0755)
	if err != nil {
		log.Fatalf("Failed to create temporary directory %s: %v", config.TempDirRoot, err)
	}

	router := gin.Default()

	// CORS configuration
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{"http://localhost:3000", "https://bloopit.vercel.app"}
	corsConfig.AllowCredentials = true
	corsConfig.AllowMethods = []string{"POST", "GET", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization", "X-API-Key"}
	router.Use(cors.New(corsConfig))

	router.GET("/health", healthCheckHandler)

	analyzeGroup := router.Group("/")
	analyzeGroup.Use(limitUploadSizeMiddleware(config.MaxUploadSizeBytes, "/analyze/"))
	if config.APIKey != "" {
		log.Println("API Key protection is ENABLED for /analyze/")
		analyzeGroup.Use(apiKeyAuthMiddleware(config.APIKey))
	} else {
		log.Println("Warning: API Key protection is DISABLED for /analyze/ because VAL_API_KEY is not set.")
	}
	analyzeGroup.POST("/analyze/", analyzeHandler)

	cleanupCtx, cleanupCancel := context.WithCancel(context.Background())
	defer cleanupCancel()
	go runPeriodicTempCleanup(cleanupCtx, config.TempDirRoot, config.MaxTempFileAge, config.MaxTempFileAge/2)

	// start server
	serverAddr := fmt.Sprintf("%s:%d", config.Host, config.Port)
	srv := &http.Server{
		Addr:    serverAddr,
		Handler: router,
	}

	log.Printf("Server starting...")
	log.Printf("Max concurrent AI calls: %d", config.MaxConcurrentAICalls)
	log.Printf("AI queue timeout: %s", config.AIQueueTimeout)
	log.Printf("Temporary directory: %s", config.TempDirRoot)
	log.Printf("Max temp file age: %s", config.MaxTempFileAge)
	log.Printf("Max upload size: %.1f MB", float64(config.MaxUploadSizeBytes)/(1024*1024))
	log.Printf("Analysis timeout: %s", config.AnalysisTimeout)
	log.Printf("Listening on %s", serverAddr)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	cleanupCancel()

	log.Println("Closing AI task queue...")
	close(aiTaskQueue)
	log.Println("Waiting for AI workers to finish...")
	aiWorkerDone := make(chan struct{})
	go func() {
		aiWorkerWg.Wait()
		close(aiWorkerDone)
	}()
	select {
	case <-aiWorkerDone:
		log.Println("All AI workers finished.")
	case <-time.After(10 * time.Second):
		log.Println("Warning: AI workers did not finish gracefully within timeout.")
	}

	// Shutdown HTTP server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exiting")
}

func aiWorker(id int, tasks <-chan aiTask, wg *sync.WaitGroup) {
	defer wg.Done()
	log.Printf("AI Worker %d started", id)
	for task := range tasks {
		atomic.AddInt32(&activeAICallsCount, 1) // Increment when task processing starts
		log.Printf("[AI Worker %d] Processing task for %s. Active calls: %d", id, task.logPrefix, atomic.LoadInt32(&activeAICallsCount))

		aiResult, aiErr := AnalyzeMessagesWithLLM(task.ctx, task.messagesData, task.gapHours)

		if errors.Is(aiErr, context.Canceled) {
			log.Printf("[AI Worker %d] Task cancelled via context for %s", id, task.logPrefix)
		} else if errors.Is(aiErr, context.DeadlineExceeded) {
			log.Printf("[AI Worker %d] Task timed out via context for %s", id, task.logPrefix)
		} else if aiErr != nil {
			log.Printf("[AI Worker %d] Error during AI analysis for %s: %v", id, task.logPrefix, aiErr)
		} else {
			log.Printf("[AI Worker %d] Finished AI analysis for %s", id, task.logPrefix)
		}

		atomic.AddInt32(&activeAICallsCount, -1) // Decrement when task processing ends
		log.Printf("[AI Worker %d] Task finished for %s. Active calls: %d", id, task.logPrefix, atomic.LoadInt32(&activeAICallsCount))

		select {
		case task.resultChan <- aiResultTuple{result: aiResult, err: aiErr}:
		default:
			log.Printf("[AI Worker %d] Failed to send result back for %s (receiver might have timed out or cancelled)", id, task.logPrefix)
		}
		close(task.resultChan)
	}
	log.Printf("AI Worker %d stopped. Final active calls: %d", id, atomic.LoadInt32(&activeAICallsCount))
}
