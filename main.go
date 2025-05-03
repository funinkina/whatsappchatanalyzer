package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

var (
	config            *Config
	analysisSemaphore chan struct{}
)

func main() {
	var err error
	config, err = LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	analysisSemaphore = make(chan struct{}, config.MaxConcurrentAnalyses)

	err = os.MkdirAll(config.TempDirRoot, 0755)
	if err != nil {
		log.Fatalf("Failed to create temporary directory %s: %v", config.TempDirRoot, err)
	}

	router := gin.Default()

	// CORS
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

	// bg tasks
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
	log.Printf("Max concurrent analyses: %d", config.MaxConcurrentAnalyses)
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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exiting")
}
