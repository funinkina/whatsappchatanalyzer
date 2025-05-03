package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"
)

func runPeriodicTempCleanup(ctx context.Context, dir string, maxAge time.Duration, interval time.Duration) {
	log.Printf("Starting periodic temp file cleanup task for %s (max age: %s, interval: %s)", dir, maxAge, interval)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cleanupTempFiles(dir, maxAge)
		case <-ctx.Done():
			log.Println("Stopping periodic temp file cleanup task.")
			return
		}
	}
}

func cleanupTempFiles(dir string, maxAge time.Duration) {
	log.Printf("Running periodic temp file cleanup in %s...", dir)
	now := time.Now()
	count := 0
	var totalSize int64 = 0

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("Temp directory %s does not exist, skipping cleanup.", dir)
			return
		}
		log.Printf("Error reading temp directory %s: %v", dir, err)
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			log.Printf("Error getting info for file %s: %v", entry.Name(), err)
			continue
		}

		filePath := filepath.Join(dir, entry.Name())
		fileAge := now.Sub(info.ModTime())
		fileSize := info.Size()

		if fileAge > maxAge {
			err := os.Remove(filePath)
			if err != nil {
				log.Printf("Error removing temp file %s: %v", filePath, err)
			} else {
				log.Printf("Cleaned up old temp file: %s (%.2f KB)", filePath, float64(fileSize)/1024.0)
				count++
				totalSize += fileSize
			}
		}
	}

	if count > 0 {
		log.Printf("Periodic cleanup removed %d files, total size: %.2f MB.", count, float64(totalSize)/(1024.0*1024.0))
	} else {
		log.Println("Periodic cleanup found no old files to remove.")
	}
}
