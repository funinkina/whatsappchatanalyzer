package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func apiKeyAuthMiddleware(requiredKey string) gin.HandlerFunc {
	if requiredKey == "" {
		log.Println("CRITICAL SERVER CONFIG ERROR: apiKeyAuthMiddleware applied, but VAL_API_KEY is not configured!")
		return func(c *gin.Context) {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"detail": "Server configuration error: API Key not set"})
		}
	}

	return func(c *gin.Context) {
		providedKey := c.GetHeader("X-API-Key")
		if providedKey == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "API key is missing"})
			return
		}
		if providedKey != requiredKey {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "Invalid API key"})
			return
		}
		c.Next()
	}
}

func limitUploadSizeMiddleware(maxSizeBytes int64, paths ...string) gin.HandlerFunc {
	pathMap := make(map[string]bool)
	for _, p := range paths {
		pathMap[p] = true
	}

	return func(c *gin.Context) {
		if _, shouldCheck := pathMap[c.Request.URL.Path]; shouldCheck {
			if c.Request.ContentLength > maxSizeBytes {
				log.Printf("Rejected upload: Content-Length %d bytes exceeds limit %d bytes.", c.Request.ContentLength, maxSizeBytes)
				c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
					"detail": fmt.Sprintf("Maximum request body size limit exceeded (%.1f MB)", float64(maxSizeBytes)/(1024*1024)),
				})
				return
			}
		}
		c.Next()
	}
}
