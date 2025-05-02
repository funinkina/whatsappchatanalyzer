package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/exp/maps"
)

type AnalysisResult struct {
	ChatName       string          `json:"chat_name"`
	TotalMessages  int             `json:"total_messages"`
	Stats          *ChatStatistics `json:"stats"`
	AIAnalysis     json.RawMessage `json:"ai_analysis"`
	Error          string          `json:"error,omitempty"`
	ProcessingTime float64         `json:"processing_time_seconds,omitempty"`
}

func AnalyzeChat(ctx context.Context, chatFilePath string, originalFilename string) (*AnalysisResult, error) {
	overallStartTime := time.Now()
	logPrefix := fmt.Sprintf("[%s]", originalFilename)
	log.Printf("%s Starting analysis for chat file: %s", logPrefix, chatFilePath)

	var messagesData []ParsedMessage
	var statsResult *ChatStatistics
	var aiResult string
	var statsErr, aiErr, preprocessErr error
	var messageCount int
	var userCount int
	var uniqueUsers []string

	// preprocessing
	preprocessStartTime := time.Now()
	messagesData, preprocessErr = preprocessMessages(chatFilePath)
	preprocessDuration := time.Since(preprocessStartTime)

	if preprocessErr != nil {
		log.Printf("%s Preprocessing failed in %s: %v", logPrefix, preprocessDuration, preprocessErr)
		return nil, fmt.Errorf("preprocessing failed: %w", preprocessErr)
	}
	messageCount = len(messagesData)
	log.Printf("%s Preprocessing finished in %s. Found %d messages.", logPrefix, preprocessDuration, messageCount)

	if messageCount == 0 {
		log.Printf("%s No messages found after preprocessing.", logPrefix)
		return &AnalysisResult{
			ChatName:       deriveChatName(originalFilename, []string{}),
			TotalMessages:  0,
			Error:          "No messages found in the file after preprocessing.",
			ProcessingTime: time.Since(overallStartTime).Seconds(),
		}, nil
	}

	usersSet := make(map[string]struct{})
	for _, msg := range messagesData {
		usersSet[msg.Sender] = struct{}{}
	}
	uniqueUsers = maps.Keys(usersSet)
	sort.Strings(uniqueUsers)
	userCount = len(uniqueUsers)
	chatName := deriveChatName(originalFilename, uniqueUsers)

	// calc dynamic convo break
	convoBreakStartTime := time.Now()
	dynamicConvoBreakMinutes := calculateDynamicConvoBreak(messagesData, 120, 30, 300)
	convoBreakDuration := time.Since(convoBreakStartTime)
	log.Printf("%s Dynamic convo break calculated (%d mins) in %s", logPrefix, dynamicConvoBreakMinutes, convoBreakDuration)

	// stats and ai analysis
	log.Printf("%s Starting concurrent statistics and AI analysis...", logPrefix)
	concurrentStartTime := time.Now()
	var wg sync.WaitGroup

	messagesDataForStats := messagesData
	var messagesDataForAI []ParsedMessage
	shouldRunAI := userCount > 1 && userCount <= maxUsersForPeopleBlock
	if shouldRunAI {
		messagesDataForAI = messagesData
	}

	wg.Add(1)
	go func(data []ParsedMessage, breakMinutes int) {
		defer wg.Done()
		statsCalcStartTime := time.Now()
		log.Printf("%s Starting statistics calculation goroutine...", logPrefix)
		statsResult, statsErr = calculateChatStatistics(data, breakMinutes)
		statsCalcDuration := time.Since(statsCalcStartTime)
		if statsErr != nil {
			log.Printf("%s Statistics goroutine finished with error in %s: %v", logPrefix, statsCalcDuration, statsErr)
		} else {
			log.Printf("%s Statistics goroutine finished successfully in %s.", logPrefix, statsCalcDuration)
		}
	}(messagesDataForStats, dynamicConvoBreakMinutes)

	if shouldRunAI {
		wg.Add(1)
		go func(data []ParsedMessage, gapMinutes float64) {
			defer wg.Done()
			aiStartTime := time.Now()
			log.Printf("%s Starting AI analysis goroutine for %d users...", logPrefix, userCount)
			aiResult, aiErr = AnalyzeMessagesWithLLM(ctx, data, gapMinutes/60.0)
			aiDuration := time.Since(aiStartTime)
			if aiErr != nil {
				log.Printf("%s AI analysis goroutine finished with error in %s: %v", logPrefix, aiDuration, aiErr)
				if errors.Is(aiErr, context.Canceled) || errors.Is(aiErr, context.DeadlineExceeded) {
					log.Printf("%s AI analysis was cancelled or timed out.", logPrefix)
				}
			} else if aiResult == "" {
				log.Printf("%s AI analysis goroutine finished successfully in %s, but returned no result (e.g., skipped due to keys).", logPrefix, aiDuration)
			} else {
				log.Printf("%s AI analysis goroutine finished successfully in %s.", logPrefix, aiDuration)
			}
		}(messagesDataForAI, float64(dynamicConvoBreakMinutes))
	} else {
		log.Printf("%s Skipping AI analysis: User count (%d) is not between 2 and %d.", logPrefix, userCount, maxUsersForPeopleBlock)
	}

	log.Printf("%s Releasing reference to messagesData list (%d messages) and suggesting GC.", logPrefix, messageCount)
	messagesData = nil
	messagesDataForStats = nil
	messagesDataForAI = nil
	runtime.GC()
	log.Printf("%s Garbage collection suggested.", logPrefix)

	// waiting for goroutines to finish
	wg.Wait()
	concurrentDuration := time.Since(concurrentStartTime)
	log.Printf("%s Concurrent tasks finished in %s.", logPrefix, concurrentDuration)

	finalResult := &AnalysisResult{
		ChatName:       chatName,
		TotalMessages:  messageCount,
		Stats:          statsResult,
		ProcessingTime: roundFloat(time.Since(overallStartTime).Seconds(), 4),
	}

	// handle AI result
	if aiResult != "" {
		finalResult.AIAnalysis = json.RawMessage(aiResult)
	} else {
		finalResult.AIAnalysis = nil
	}

	var errorMessages []string
	if statsErr != nil {
		errorMessages = append(errorMessages, fmt.Sprintf("Statistics failed: %s", statsErr.Error()))
		finalResult.Stats = nil
	}
	if aiErr != nil {
		if !(errors.Is(aiErr, context.Canceled) || errors.Is(aiErr, context.DeadlineExceeded)) {
			errorMessages = append(errorMessages, fmt.Sprintf("AI analysis failed: %s", aiErr.Error()))
		}
	}

	if len(errorMessages) > 0 {
		finalResult.Error = strings.Join(errorMessages, "; ")
		log.Printf("%s Analysis complete with errors in %.2f seconds: %s", logPrefix, finalResult.ProcessingTime, finalResult.Error)
		return finalResult, nil
	}

	log.Printf("%s Analysis complete successfully in %.2f seconds.", logPrefix, finalResult.ProcessingTime)
	return finalResult, nil
}

func deriveChatName(originalFilename string, users []string) string {
	userCount := len(users)
	defaultName := originalFilename
	if defaultName == "" {
		defaultName = "WhatsApp Chat"
	}

	switch userCount {
	case 0:
		return defaultName
	case 1:
		return fmt.Sprintf("Notes (%s)", users[0])
	case 2:
		return fmt.Sprintf("%s & %s", users[0], users[1])
	default:
		return fmt.Sprintf("%s, %s & %d others", users[0], users[1], userCount-2)
	}
}
