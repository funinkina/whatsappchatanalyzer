package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
)

const (
	groqModel              = "meta-llama/llama-4-scout-17b-16e-instruct"
	groqMaxTokens          = 4096
	groqTemperature        = 1.3
	retryAttempts          = 3
	retryWaitMinSeconds    = 1
	retryWaitMaxSeconds    = 5
	groqAPIEndpoint        = "https://api.groq.com/openai/v1/chat/completions"
	maxUsersForPeopleBlock = 10
)

var (
	primaryKeys            map[int]string
	fallbackKey            string
	primaryKeyIndices      []int
	currentPrimaryKeyIndex int
	keyRotationLock        sync.Mutex
	httpClient             *http.Client
)

func init() {
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: Error loading .env file:", err)
	}

	primaryKeys = make(map[int]string)
	for i := 1; i <= 7; i++ {
		key := os.Getenv(fmt.Sprintf("GROQ_API_KEY%d", i))
		if key != "" {
			primaryKeys[i] = key
			primaryKeyIndices = append(primaryKeyIndices, i) // Store the index
		}
	}

	fallbackKey = os.Getenv("GROQ_API_KEY9")

	if len(primaryKeys) == 0 && fallbackKey == "" {
		log.Println("CRITICAL: No valid GROQ_API_KEYs (1-7 or 9) found in environment variables. AI Analysis disabled.")
	} else {
		log.Printf("Found %d primary Groq keys and %s.", len(primaryKeys),
			func() string {
				if fallbackKey != "" {
					return "1 fallback key"
				}
				return "no fallback key"
			}())
	}

	httpClient = &http.Client{
		Timeout: 30 * time.Second,
	}
}

func getNextAPIKey() (keyIndex int, key string, keyName string) {
	keyRotationLock.Lock()
	defer keyRotationLock.Unlock()

	if len(primaryKeyIndices) == 0 {
		return 0, "", ""
	}

	keyIndex = primaryKeyIndices[currentPrimaryKeyIndex]
	key = primaryKeys[keyIndex]
	keyName = fmt.Sprintf("Primary Key #%d", keyIndex)

	currentPrimaryKeyIndex = (currentPrimaryKeyIndex + 1) % len(primaryKeyIndices)

	return keyIndex, key, keyName
}

type GroqRequest struct {
	Model          string              `json:"model"`
	Messages       []GroqMessage       `json:"messages"`
	Temperature    float64             `json:"temperature"`
	MaxTokens      int                 `json:"max_tokens"`
	ResponseFormat *GroqResponseFormat `json:"response_format,omitempty"`
}

type GroqMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GroqResponseFormat struct {
	Type string `json:"type"`
}

type GroqResponse struct {
	ID      string        `json:"id"`
	Object  string        `json:"object"`
	Created int64         `json:"created"`
	Model   string        `json:"model"`
	Choices []GroqChoice  `json:"choices"`
	Usage   GroqUsageInfo `json:"usage"`
	Error   *GroqError    `json:"error,omitempty"` // Added error field
}

type GroqChoice struct {
	Index        int                 `json:"index"`
	Message      GroqResponseMessage `json:"message"`
	FinishReason string              `json:"finish_reason"`
}

type GroqResponseMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GroqUsageInfo struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type GroqError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Param   string `json:"param"`
	Code    string `json:"code"`
}

func invokeGroq(ctx context.Context, apiKey, keyName, systemPrompt, userContent string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("attempted to call Groq with empty API key (%s)", keyName)
	}

	var lastErr error
	var backoff time.Duration

	for attempt := 1; attempt <= retryAttempts; attempt++ {
		select {
		case <-ctx.Done():
			log.Printf("Context cancelled before Groq attempt %d with %s: %v", attempt, keyName, ctx.Err())
			if lastErr != nil {
				return "", fmt.Errorf("context cancelled after previous error with %s: %w (context: %v)", keyName, lastErr, ctx.Err())
			}
			return "", fmt.Errorf("context cancelled before Groq call with %s: %w", keyName, ctx.Err())
		default:
		}

		if attempt > 1 {
			backoff = time.Duration(math.Pow(2, float64(attempt-1))) * time.Second
			maxWait := time.Duration(retryWaitMaxSeconds) * time.Second
			if backoff > maxWait {
				backoff = maxWait
			}
			jitter := time.Duration(float64(backoff) * 0.2 * (rand.Float64() - 0.5))
			waitDuration := backoff + jitter
			if waitDuration < 0 {
				waitDuration = time.Duration(retryWaitMinSeconds) * time.Second
			}

			log.Printf("Retrying Groq API call with %s (attempt %d) after error: %v. Waiting for %s...", keyName, attempt, lastErr, waitDuration)

			select {
			case <-time.After(waitDuration):
			case <-ctx.Done():
				log.Printf("Context cancelled during retry wait for %s: %v", keyName, ctx.Err())
				return "", fmt.Errorf("context cancelled during retry wait for %s: %w (last API error: %v)", keyName, ctx.Err(), lastErr)
			}
		}

		log.Printf("Attempting Groq analysis with %s (Attempt %d/%d)...", keyName, attempt, retryAttempts)

		requestPayload := GroqRequest{
			Model: groqModel,
			Messages: []GroqMessage{
				{Role: "system", Content: systemPrompt},
				{Role: "user", Content: userContent},
			},
			Temperature:    groqTemperature,
			MaxTokens:      groqMaxTokens,
			ResponseFormat: &GroqResponseFormat{Type: "json_object"},
		}
		requestBodyBytes, err := json.Marshal(requestPayload)
		if err != nil {
			return "", fmt.Errorf("failed to marshal Groq request payload with %s: %w", keyName, err)
		}

		req, err := http.NewRequestWithContext(ctx, "POST", groqAPIEndpoint, bytes.NewBuffer(requestBodyBytes))
		if err != nil {
			return "", fmt.Errorf("failed to create Groq request object with %s: %w", keyName, err)
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("HTTP request failed for %s (attempt %d): %w", keyName, attempt, err)
			log.Printf("Warning: %v", lastErr)
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				log.Printf("Context error during HTTP request for %s: %v", keyName, err)
				return "", lastErr
			}
			continue
		}

		responseBodyBytes, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("failed to read response body from %s (attempt %d, status %d): %w", keyName, attempt, resp.StatusCode, readErr)
			log.Printf("Warning: %v", lastErr)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			var groqErr GroqResponse
			_ = json.Unmarshal(responseBodyBytes, &groqErr)

			errMsg := fmt.Sprintf("API error from %s (attempt %d): status %d", keyName, attempt, resp.StatusCode)
			if groqErr.Error != nil {
				errMsg += fmt.Sprintf(" - Type: %s, Message: %s", groqErr.Error.Type, groqErr.Error.Message)
			} else {
				bodySample := string(responseBodyBytes)
				if len(bodySample) > 150 {
					bodySample = bodySample[:150] + "..."
				}
				errMsg += fmt.Sprintf(" - Body: %s", bodySample)
			}
			lastErr = errors.New(errMsg)

			if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
				log.Printf("Warning: Retryable %v", lastErr)
				continue
			} else {
				log.Printf("Error: Non-retryable %v", lastErr)
				return "", lastErr
			}
		}

		var groqResp GroqResponse
		err = json.Unmarshal(responseBodyBytes, &groqResp)
		if err != nil {
			bodySample := string(responseBodyBytes)
			if len(bodySample) > 150 {
				bodySample = bodySample[:150] + "..."
			}
			lastErr = fmt.Errorf("failed to decode successful Groq response (status %d) from %s: %w. Body: %s", resp.StatusCode, keyName, err, bodySample)
			log.Printf("Error: %v", lastErr)
			return "", lastErr
		}

		if len(groqResp.Choices) == 0 || groqResp.Choices[0].Message.Content == "" {
			lastErr = fmt.Errorf("no valid choices/content returned from Groq with %s (attempt %d, status %d)", keyName, attempt, resp.StatusCode)
			log.Printf("Warning: %v", lastErr)
			continue
		}

		content := groqResp.Choices[0].Message.Content
		trimmedContent := strings.TrimSpace(content)

		if strings.HasPrefix(trimmedContent, "{") && strings.HasSuffix(trimmedContent, "}") {
			var js json.RawMessage
			if err := json.Unmarshal([]byte(trimmedContent), &js); err == nil {
				log.Printf("Successfully received valid JSON with %s.", keyName)
				return trimmedContent, nil
			} else {
				lastErr = fmt.Errorf("output from %s looks like JSON but failed validation: %w Content: %s", keyName, err, func() string {
					if len(content) > 100 {
						return content[:100]
					} else {
						return content
					}
				}())
				log.Printf("Error: %v", lastErr)
				return "", lastErr
			}
		} else {
			lastErr = fmt.Errorf("output from %s does not look like JSON. Content: %s", keyName, func() string {
				if len(content) > 100 {
					return content[:100]
				} else {
					return content
				}
			}())
			log.Printf("Error: %v", lastErr)
			return "", lastErr
		}
	}

	log.Printf("All %d Groq API attempts failed for key %s.", retryAttempts, keyName)
	return "", fmt.Errorf("all Groq attempts failed for %s: %w", keyName, lastErr)
}

func AnalyzeMessagesWithLLM(ctx context.Context, data []ParsedMessage, gapHours float64) (string, error) {
	if len(primaryKeys) == 0 && fallbackKey == "" {
		log.Println("Skipping AI Analysis: No Groq API keys configured.")
		return "", nil
	}

	log.Println("Grouping messages by topic for AI analysis...")
	topics := groupMessagesByTopic(data, gapHours)
	log.Println("Stratifying messages for AI analysis...")
	stratifiedData := stratifyMessages(topics)

	if len(stratifiedData) == 0 {
		log.Println("No messages eligible for AI analysis after grouping and stratifying.")
		return "", nil
	}

	groupedMessagesJSONBytes, err := json.MarshalIndent(stratifiedData, "", "  ")
	if err != nil {
		log.Printf("Error: Failed to serialize messages for LLM: %v", err)
		return "", fmt.Errorf("failed to serialize messages for LLM: %w", err)
	}
	groupedMessagesJSON := string(groupedMessagesJSONBytes)

	uniqueUsers := make(map[string]struct{})
	for _, msg := range data {
		uniqueUsers[msg.Sender] = struct{}{}
	}
	userCount := len(uniqueUsers)

	systemPrompt := `
		You will be given a list of messages from each user in a chat.
		The messages are stratified and cherry picked to be the most interesting, funny, or dramatic.
		Your task is to summarize the chat in a fun, witty, and engaging way and comment on the overall content of the chat.
		Do not think of these chats as random or jumping from topic to topic.
		Instead, think of them as a curated collection of messages that tell a story or convey a theme.
		Your summary should be entertaining and engaging, as if you are a gossip vlogger who lives for chaos.
		Your summary should be 3 to 5 sentences long and capture the overall vibe, drama, relationships, and main tea without quoting exact messages.
		You can also include some fun commentary on the users and their personalities, but keep it light and playful.

		*DO NOT DO THE FOLLOWING*:
		- Do NOT say that the chats are random or jumping from topic to topic.
		- Do NOT say that you are an AI or LLM.
		- Do NOT say that this chat is a mess, jumbled, or chaotic.

		*STRICT INSTRUCTIONS*:
		- Output ONLY valid JSON.
		- Your entire response must start with { and end with }.
		- NO extra text, commentary, markdown, or code block indicators before or after the JSON object.

		Your output JSON object MUST include the following keys:
		"summary": "<Give a wild, witty summary of the chat — 3 to 5 sentences max. 
		Capture the overall vibe, drama, relationships, and main tea without quoting exact messages. 
		Feel free to speculate like a gossip vlogger who lives for chaos.>"
		`
	if userCount > 0 && userCount <= maxUsersForPeopleBlock {
		systemPrompt += `,
			"people": [
			{
				"name": "<person name>",
				"animal": "one of: <owl, lion, dolphin, fox, bear, rabbit, monkey, tiger, wolf, eagle, elephant, penguin, cat, dog, koala, panda, sheep> — each assigned uniquely strictly from this list. choose wisely",
				"description": "<person's name is the ANIMAL of the <'group' if count > 3 else 'trio' if count == 3 else 'duo'>, with a brief reason! Then add 2 fun lines about their vibe, keep it Gen Z, playful, and simple.>"
			}
			// ... include one object for each unique person in the chat
			// ... and make sure to only analyze the people whose messages are given to you, not people mentioned in the chats.
			]
			}`
	} else {
		systemPrompt += `
			}`
	}

	var lastErr error
	numPrimaryKeys := len(primaryKeyIndices)
	for i := 0; i < numPrimaryKeys; i++ {
		select {
		case <-ctx.Done():
			log.Printf("Context cancelled before trying next primary key: %v", ctx.Err())
			if lastErr != nil {
				return "", fmt.Errorf("context cancelled after primary key failure: %w (context: %v)", lastErr, ctx.Err())
			}
			return "", fmt.Errorf("context cancelled before trying next primary key: %w", ctx.Err())
		default:
		}

		_, keyToTry, keyName := getNextAPIKey()
		if keyToTry == "" {
			continue
		}

		result, err := invokeGroq(ctx, keyToTry, keyName, systemPrompt, groupedMessagesJSON)
		if err == nil {
			log.Printf("AI analysis successful with %s.", keyName)
			return result, nil
		} else {
			log.Printf("Warning: Failed attempt with %s: %v", keyName, err)
			lastErr = err
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				log.Printf("Context cancelled during %s attempt, stopping AI analysis.", keyName)
				return "", err
			}
		}
	}

	if fallbackKey != "" {
		log.Println("Primary keys failed or unavailable, attempting fallback key.")
		select {
		case <-ctx.Done():
			log.Printf("Context cancelled before trying fallback key: %v", ctx.Err())
			if lastErr != nil {
				return "", fmt.Errorf("context cancelled after primary key failures, before fallback: %w (context: %v)", lastErr, ctx.Err())
			}
			return "", fmt.Errorf("context cancelled before trying fallback key: %w", ctx.Err())
		default:
		}

		keyName := "Fallback Key #9"
		result, err := invokeGroq(ctx, fallbackKey, keyName, systemPrompt, groupedMessagesJSON)
		if err == nil {
			log.Printf("AI analysis successful with %s.", keyName)
			return result, nil
		} else {
			log.Printf("Error: Fallback key %s also failed: %v", keyName, err)
			lastErr = err
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				log.Printf("Context cancelled during %s attempt, stopping AI analysis.", keyName)
				return "", err
			}
		}
	}

	log.Println("Error: All Groq API key attempts failed.")
	if lastErr != nil {
		return "", fmt.Errorf("all Groq API keys failed: %w", lastErr)
	}
	return "", errors.New("all Groq API keys failed (no specific error captured)")
}
