package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/exp/maps"
)

type aiResultTuple struct {
	result string
	err    error
}

type aiTask struct {
	ctx          context.Context
	messagesData []ParsedMessage
	gapHours     float64
	resultChan   chan aiResultTuple
	logPrefix    string
}

type AnalysisResult struct {
	ChatName      string          `json:"chat_name"`
	TotalMessages int             `json:"total_messages"`
	Stats         *ChatStatistics `json:"stats"`
	AIAnalysis    json.RawMessage `json:"ai_analysis"`
	Error         string          `json:"error,omitempty"`
}

func AnalyzeChat(ctx context.Context, chatReader io.Reader, originalFilename string, aiQueue chan<- aiTask, aiQueueTimeout time.Duration) (*AnalysisResult, error) {
	logPrefix := fmt.Sprintf("[%s]", originalFilename)
	// log.Printf("%s Starting analysis using reader", logPrefix)
	// Added to store raw message count
	var messagesData []ParsedMessage
	var statsResult *ChatStatistics
	var statsErr, aiErr error
	var preprocessErr error
	var rawMessageCount int
	var userCount int
	var uniqueUsers []string

	rawMessageCount, messagesData, preprocessErr = preprocessMessages(chatReader) // Modified to get rawMessageCount
	if preprocessErr != nil {
		log.Printf("%s Preprocessing failed: %v", logPrefix, preprocessErr)
		return nil, fmt.Errorf("preprocessing failed: %w", preprocessErr)
	}

	if rawMessageCount == 0 {
		log.Printf("%s No messages found after preprocessing.", logPrefix)
		return &AnalysisResult{
			ChatName:      deriveChatName(originalFilename, []string{}),
			TotalMessages: 0,
			Error:         "No messages found in the file after preprocessing.",
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
	dynamicConvoBreakMinutes := calculateDynamicConvoBreak(messagesData, 120, 30, 300)

	var wg sync.WaitGroup
	var aiResultChan chan aiResultTuple

	wg.Add(1)
	go func(data []ParsedMessage, breakMinutes int) {
		defer wg.Done()
		statsResult, statsErr = calculateChatStatistics(data, breakMinutes)
		if statsErr != nil {
			log.Printf("%s Statistics goroutine finished with error: %v", logPrefix, statsErr)
		}
		data = nil
	}(messagesData, dynamicConvoBreakMinutes)

	shouldRunAI := userCount > 1 && userCount <= maxUsersForPeopleBlock
	if shouldRunAI {
		// log.Printf("%s Preparing AI analysis task.", logPrefix)
		aiResultChan = make(chan aiResultTuple, 1)
		task := aiTask{
			ctx:          ctx,
			messagesData: messagesData,
			gapHours:     float64(dynamicConvoBreakMinutes) / 60.0,
			resultChan:   aiResultChan,
			logPrefix:    logPrefix,
		}

		sendTimer := time.NewTimer(aiQueueTimeout)
		select {
		case aiQueue <- task:
			// log.Printf("%s AI task successfully queued.", logPrefix)

		case <-ctx.Done():
			log.Printf("%s Context cancelled before AI task could be queued: %v", logPrefix, ctx.Err())
			aiErr = ctx.Err()
			if !sendTimer.Stop() {
				<-sendTimer.C
			}
		case <-sendTimer.C:
			log.Printf("%s Timed out (%s) waiting to queue AI task.", logPrefix, aiQueueTimeout)
			return nil, ErrAIQueueTimeout
		}
		if !sendTimer.Stop() {
			select {
			case <-sendTimer.C:
			default:
			}
		}

	} else {
		log.Printf("%s Skipping AI analysis: User count (%d) is not between 2 and %d.", logPrefix, userCount, maxUsersForPeopleBlock)
	}

	messagesData = nil
	runtime.GC()

	wg.Wait()

	var aiFinalResult string
	if aiResultChan != nil && aiErr == nil {
		// log.Printf("%s Waiting for AI result...", logPrefix)
		select {
		case resultTuple, ok := <-aiResultChan:
			if !ok {
				log.Printf("%s AI result channel closed unexpectedly.", logPrefix)
				aiErr = errors.New("AI worker closed channel unexpectedly")
			} else {
				aiFinalResult = resultTuple.result
				aiErr = resultTuple.err
				if aiErr != nil {
					log.Printf("%s AI analysis returned an error: %v", logPrefix, aiErr)
				} else {
					// log.Printf("%s Successfully received AI result.", logPrefix)
				}
			}
		case <-ctx.Done():
			log.Printf("%s Context cancelled while waiting for AI result: %v", logPrefix, ctx.Err())
			aiErr = ctx.Err()
		}
	}

	finalResult := &AnalysisResult{
		ChatName:      chatName,
		TotalMessages: rawMessageCount,
		Stats:         statsResult,
	}

	if finalResult.Stats != nil {
		finalResult.Stats.TotalMessages = rawMessageCount
	} else if rawMessageCount > 0 && len(messagesData) == 0 {
		finalResult.Stats = &ChatStatistics{
			TotalMessages: rawMessageCount,
		}
	}

	if aiFinalResult != "" && aiErr == nil {
		finalResult.AIAnalysis = json.RawMessage(aiFinalResult)
	} else {
		finalResult.AIAnalysis = nil
	}

	var errorMessages []string
	if statsErr != nil {
		errorMessages = append(errorMessages, fmt.Sprintf("Statistics failed: %s", statsErr.Error()))
		finalResult.Stats = nil
	}

	if aiErr != nil && !errors.Is(aiErr, context.Canceled) && !errors.Is(aiErr, context.DeadlineExceeded) {
		errorMessages = append(errorMessages, fmt.Sprintf("AI analysis failed: %s", aiErr.Error()))
	}

	if len(errorMessages) > 0 {
		finalResult.Error = strings.Join(errorMessages, "; ")
		log.Printf("%s Analysis complete with errors: %s", logPrefix, finalResult.Error)
	} //else {
	// log.Printf("%s Analysis complete successfully.", logPrefix)
	//	}
	return finalResult, nil
}

func deriveChatName(originalFilename string, users []string) string {
	displayNames := extractDisplayNames(users)

	userCount := len(displayNames)
	defaultName := strings.TrimSuffix(originalFilename, ".txt")
	if defaultName == "" {
		defaultName = "Bloop Analysis"
	}

	switch userCount {
	case 0:
		return defaultName
	case 1:
		return fmt.Sprintf("Chat with %s", displayNames[0])
	case 2:
		return fmt.Sprintf("%s & %s", displayNames[0], displayNames[1])
	default:
		return fmt.Sprintf("%s, %s & %d others", displayNames[0], displayNames[1], userCount-2)
	}
}
