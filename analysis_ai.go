package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const (
	groqMaxTokens          = 4096
	groqTemperature        = 1.3
	retryAttempts          = 2
	singleRetryWaitSeconds = 5
	groqAPIEndpoint        = "https://api.groq.com/openai/v1/chat/completions"
	maxUsersForPeopleBlock = 15
)

var (
	groqAPIKey string
	groqModel  string
	httpClient *http.Client
)

func init() {
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: Error loading .env file:", err)
	}

	groqAPIKey = os.Getenv("GROQ_API_KEY")
	groqModel = os.Getenv("GROQ_MODEL")

	if groqAPIKey == "" {
		log.Println("CRITICAL: GROQ_API_KEY not found in environment variables. AI Analysis disabled.")
	} else {
		log.Println("Found GROQ_API_KEY for AI Analysis.")
	}

	if groqModel == "" {
		log.Println("CRITICAL: GROQ_MODEL not found in environment variables. Defaulting to meta-llama/llama-4-scout-17b-16e-instruct.")
		groqModel = "meta-llama/llama-4-scout-17b-16e-instruct"
	}

	httpClient = &http.Client{
		Timeout: 30 * time.Second,
	}
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
	Error   *GroqError    `json:"error,omitempty"`
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

func invokeGroq(ctx context.Context, systemPrompt, userContent string) (string, error) {
	if groqAPIKey == "" {
		return "", errors.New("attempted to call Groq with no API key configured")
	}

	var lastErr error
	keyName := "GROQ_API_KEY"

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
			waitDuration := time.Duration(singleRetryWaitSeconds) * time.Second
			log.Printf("Retrying Groq API call with %s (attempt %d) after error: %v. Waiting for %s...", keyName, attempt, lastErr, waitDuration)

			select {
			case <-time.After(waitDuration):
			case <-ctx.Done():
				log.Printf("Context cancelled during retry wait for %s: %v", keyName, ctx.Err())
				return "", fmt.Errorf("context cancelled during retry wait for %s: %w (last API error: %v)", keyName, ctx.Err(), lastErr)
			}
		}

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
		req.Header.Set("Authorization", "Bearer "+groqAPIKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("HTTP request failed for %s (attempt %d): %w", keyName, attempt, err)
			log.Printf("Warning: %v", lastErr)
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				log.Printf("Context error during HTTP request for %s: %v", keyName, err)
				return "", lastErr
			}
			if attempt == retryAttempts {
				return "", lastErr
			}
			continue
		}

		responseBodyBytes, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("failed to read response body from %s (attempt %d, status %d): %w", keyName, attempt, resp.StatusCode, readErr)
			log.Printf("Warning: %v", lastErr)
			if attempt == retryAttempts {
				return "", lastErr
			}
			continue
		}

		if resp.StatusCode != http.StatusOK {
			var groqErrResp GroqResponse
			_ = json.Unmarshal(responseBodyBytes, &groqErrResp)

			errMsg := fmt.Sprintf("API error from %s (attempt %d): status %d", keyName, attempt, resp.StatusCode)
			if groqErrResp.Error != nil {
				errMsg += fmt.Sprintf(" - Type: %s, Message: %s", groqErrResp.Error.Type, groqErrResp.Error.Message)
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
				if attempt == retryAttempts {
					return "", lastErr
				}
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
			if attempt == retryAttempts {
				return "", lastErr
			}
			continue
		}

		content := groqResp.Choices[0].Message.Content
		trimmedContent := strings.TrimSpace(content)

		if strings.HasPrefix(trimmedContent, "{") && strings.HasSuffix(trimmedContent, "}") {
			var js json.RawMessage
			if err := json.Unmarshal([]byte(trimmedContent), &js); err == nil {
				return trimmedContent, nil
			} else {
				lastErr = fmt.Errorf("output from %s looks like JSON but failed validation: %w Content: %s", keyName, err, func() string {
					if len(content) > 100 {
						return content[:100]
					}
					return content
				}())
				log.Printf("Error: %v", lastErr)
				return "", lastErr
			}
		} else {
			lastErr = fmt.Errorf("output from %s does not look like JSON. Content: %s", keyName, func() string {
				if len(content) > 100 {
					return content[:100]
				}
				return content
			}())
			log.Printf("Error: %v", lastErr)
			return "", lastErr
		}
	}

	log.Printf("All %d Groq API attempts failed for key %s.", retryAttempts, keyName)
	if lastErr != nil {
		return "", fmt.Errorf("all Groq attempts failed for %s: %w", keyName, lastErr)
	}
	return "", fmt.Errorf("all Groq attempts failed for %s (unknown error)", keyName)
}

func AnalyzeMessagesWithLLM(ctx context.Context, data []ParsedMessage, gapHours float64) (string, error) {
	if groqAPIKey == "" {
		log.Println("Skipping AI Analysis: GROQ_API_KEY not configured.")
		return "", nil
	}

	topics := groupMessagesByTopic(data, gapHours)
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
        Instead, think of them as a curated collection of messages that have been handpicked for you to analyze.
        Your summary should be entertaining and engaging.
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

	result, err := invokeGroq(ctx, systemPrompt, groupedMessagesJSON)
	if err != nil {
		log.Printf("Error: AI analysis failed after all attempts with GROQ_API_KEY: %v", err)
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			log.Printf("Context cancelled during AI analysis, stopping.")
		}
		return "", fmt.Errorf("AI analysis failed: %w", err)
	}

	return result, nil
}
