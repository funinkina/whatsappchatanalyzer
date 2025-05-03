package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"golang.org/x/exp/maps"
)

type ParsedMessage struct {
	Timestamp       time.Time
	DateStr         string
	Sender          string
	CleanedMessage  string
	OriginalMessage string
}

var (
	stopwordsSet          map[string]struct{}
	systemMessagePatterns []string
	timestampPattern      *regexp.Regexp
	urlPattern            *regexp.Regexp
	emojiPattern          *regexp.Regexp
	excessiveCharsPattern *regexp.Regexp
	timestampParseLayouts []string
)

const (
	dataDir                 = "data"
	stopwordsFile           = "stopwords.txt"
	systemMessagesFile      = "system_message_patterns.json"
	allowedPunctuationRegex = `.,?!'"()`
)

func init() {
	timestampPattern = regexp.MustCompile(
		`(?i)^\s*(?:\x{200e})?` + // Optional LRM at start, optional space
			`\[?` + // Optional opening bracket
			`(\d{1,2}/\d{1,2}/\d{2,4})` + // Date (Group 1)
			`,\s*` + // Comma and space separator
			`(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\x{202f}](?:AM|PM))?)` + // Time (Group 2) - handles space or \u202f, optional secs
			`(?:\]?\s*-\s*|\]\s*)` + // Separator (non-capturing)
			`(.*?):\s*` + // Sender (Group 3) - Non-greedy match for sender name
			`(.*)`) // Message (Group 4) - Rest of the line

	urlPattern = regexp.MustCompile(`https?://\S+|www\.\S+`)

	emojiPattern = regexp.MustCompile("[" +
		"\U0001F300-\U0001F5FF" + // symbols & pictographs
		"\U0001F600-\U0001F64F" + // emoticons
		"\U0001F680-\U0001F6FF" + // transport & map symbols
		"\U0001F1E0-\U0001F1FF" + // flags (iOS)
		"\U00002700-\U000027BF" + // Dingbats
		"\U00002600-\U000026FF" + // Miscellaneous Symbols
		"\U0000FE00-\U0000FE0F" + // Variation Selectors
		"\U0001F900-\U0001F9FF" + // Supplemental Symbols and Pictographs
		"]+")

	escapedPunctuation := regexp.QuoteMeta(allowedPunctuationRegex)
	excessiveCharsPattern = regexp.MustCompile(`[^a-zA-Z0-9\s` + escapedPunctuation + `]`)

	var err error
	stopwordsSet, err = loadStopwords(filepath.Join(dataDir, stopwordsFile))
	if err != nil {
		log.Printf("Warning: Failed to load stopwords: %v. Proceeding without stopword removal.", err)
		stopwordsSet = make(map[string]struct{})
	}

	systemMessagePatterns, err = loadSystemMessagePatterns(filepath.Join(dataDir, systemMessagesFile))
	if err != nil {
		log.Printf("Warning: Failed to load system message patterns: %v", err)
		systemMessagePatterns = []string{}
	}

	timestampParseLayouts = []string{
		// US style with AM/PM
		"1/2/06 3:04 PM",        // m/d/yy h:mm AM/PM
		"1/2/2006 3:04 PM",      // m/d/yyyy h:mm AM/PM
		"1/2/06 3:04:05 PM",     // m/d/yy h:mm:ss AM/PM
		"1/2/2006 3:04:05 PM",   // m/d/yyyy h:mm:ss AM/PM
		"01/02/06 3:04 PM",      // mm/dd/yy h:mm AM/PM
		"01/02/2006 3:04 PM",    // mm/dd/yyyy h:mm AM/PM
		"01/02/06 3:04:05 PM",   // mm/dd/yy h:mm:ss AM/PM
		"01/02/2006 3:04:05 PM", // mm/dd/yyyy h:mm:ss AM/PM

		// European style 24-hour
		"2/1/06 15:04",        // d/m/yy HH:mm
		"2/1/2006 15:04",      // d/m/yyyy HH:mm
		"2/1/06 15:04:05",     // d/m/yy HH:mm:ss
		"2/1/2006 15:04:05",   // d/m/yyyy HH:mm:ss
		"02/01/06 15:04",      // dd/mm/yy HH:mm
		"02/01/2006 15:04",    // dd/mm/yyyy HH:mm
		"02/01/06 15:04:05",   // dd/mm/yy HH:mm:ss
		"02/01/2006 15:04:05", // dd/mm/yyyy HH:mm:ss
	}
}

func loadStopwords(filepath string) (map[string]struct{}, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, fmt.Errorf("could not open stopwords file '%s': %w", filepath, err)
	}
	defer file.Close()

	stopwords := make(map[string]struct{})
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		word := strings.ToLower(strings.TrimSpace(scanner.Text()))
		if word != "" {
			stopwords[word] = struct{}{}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading stopwords file '%s': %w", filepath, err)
	}
	log.Printf("Loaded %d stopwords from %s", len(stopwords), filepath)
	return stopwords, nil
}

func loadSystemMessagePatterns(filepath string) ([]string, error) {
	file, err := os.ReadFile(filepath)
	if err != nil {
		return nil, fmt.Errorf("could not read system messages file '%s': %w", filepath, err)
	}

	var patterns []string
	err = json.Unmarshal(file, &patterns)
	if err != nil {
		return nil, fmt.Errorf("could not decode JSON from '%s': %w", filepath, err)
	}
	log.Printf("Loaded %d system message patterns from %s", len(patterns), filepath)
	return patterns, nil
}

func preprocessMessages(chatFilePath string) ([]ParsedMessage, error) {
	file, err := os.Open(chatFilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open chat file %s: %w", chatFilePath, err)
	}
	defer file.Close()

	messagesData := []ParsedMessage{}
	scanner := bufio.NewScanner(file)
	lineNumber := 0

	for scanner.Scan() {
		lineNumber++
		line := scanner.Text()
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		line = strings.TrimPrefix(line, "\u200e")

		match := timestampPattern.FindStringSubmatch(line)
		if match == nil || len(match) != 5 {
			continue
		}

		dateStr := strings.TrimSpace(match[1])
		timeStr := strings.TrimSpace(match[2])
		sender := strings.TrimSpace(match[3])
		message := strings.TrimSpace(match[4])

		message = strings.TrimPrefix(message, "\u200e")

		isSystemMessage := false
		for _, pattern := range systemMessagePatterns {
			if strings.Contains(message, pattern) {
				isSystemMessage = true
				break
			}
		}
		if isSystemMessage || strings.Contains(message, "<attached:") || strings.Contains(message, " omitted>") || strings.Contains(message, "omitted media") {
			continue
		}

		var timestamp time.Time
		var parseError error
		parsed := false
		timeCleaned := strings.ToUpper(strings.ReplaceAll(timeStr, "\u202f", " "))
		datetimeStr := dateStr + " " + timeCleaned

		for _, layout := range timestampParseLayouts {
			hasSecondsLayout := strings.Contains(layout, ":05")
			hasSecondsData := strings.Count(timeCleaned, ":") >= 2
			hasAmPmLayout := strings.Contains(layout, " PM")
			hasAmPmData := strings.HasSuffix(timeCleaned, " AM") || strings.HasSuffix(timeCleaned, " PM")

			if hasSecondsLayout != hasSecondsData || hasAmPmLayout != hasAmPmData {
				continue
			}

			timestamp, parseError = time.Parse(layout, datetimeStr)
			if parseError == nil {
				parsed = true
				break
			}
		}

		if !parsed {
			log.Printf("Warning line %d: Could not parse timestamp from string: '%s' in line: %s", lineNumber, datetimeStr, line)
			continue
		}

		cleanedMessage := cleanTextRemoveStopwords(message)

		if cleanedMessage != "" {
			messagesData = append(messagesData, ParsedMessage{
				Timestamp:       timestamp,
				DateStr:         dateStr,
				Sender:          sender,
				CleanedMessage:  cleanedMessage,
				OriginalMessage: message,
			})
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading chat file %s: %w", chatFilePath, err)
	}

	log.Printf("Preprocessing finished for %s. Found %d valid messages.", chatFilePath, len(messagesData))
	return messagesData, nil
}

func removeLinks(text string) string {
	return urlPattern.ReplaceAllString(text, "")
}

func removeEmojis(text string) string {
	return emojiPattern.ReplaceAllString(text, "")
}

func normalizeWord(word string) string {
	trimmed := strings.Trim(word, string(stringPunctuation))
	return strings.ToLower(trimmed)
}

const stringPunctuation = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"

func cleanTextRemoveStopwords(text string) string {
	text = removeLinks(text)
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}

	words := strings.Fields(text)
	filteredWords := make([]string, 0, len(words))

	for _, word := range words {
		normalized := normalizeWord(word)
		_, isStopword := stopwordsSet[normalized]
		if !isStopword && len(normalized) > 2 && normalized != "" {
			filteredWords = append(filteredWords, normalized)
		}
	}
	return strings.Join(filteredWords, " ")
}

func containsExcessiveSpecialChars(text string) bool {
	return excessiveCharsPattern.MatchString(text)
}

type Topic []ParsedMessage

func groupMessagesByTopic(data []ParsedMessage, gapHours float64) []Topic {
	if len(data) == 0 {
		return []Topic{}
	}

	sort.SliceStable(data, func(i, j int) bool {
		return data[i].Timestamp.Before(data[j].Timestamp)
	})

	groupedTopicsRaw := []Topic{}
	currentTopicRaw := Topic{data[0]}
	gapDuration := time.Duration(gapHours * float64(time.Hour))

	for i := 1; i < len(data); i++ {
		prevTime := data[i-1].Timestamp
		currTime := data[i].Timestamp
		timeDiff := currTime.Sub(prevTime)

		if timeDiff >= gapDuration {
			// Start a new topic
			if len(currentTopicRaw) > 0 {
				groupedTopicsRaw = append(groupedTopicsRaw, currentTopicRaw)
			}
			currentTopicRaw = Topic{}
		}
		currentTopicRaw = append(currentTopicRaw, data[i])
	}

	if len(currentTopicRaw) > 0 {
		groupedTopicsRaw = append(groupedTopicsRaw, currentTopicRaw)
	}

	processedTopics := []Topic{}
	for _, rawTopic := range groupedTopicsRaw {
		processedTopic := Topic{}
		for _, msg := range rawTopic {
			emojiFree := removeEmojis(msg.CleanedMessage)
			emojiFree = strings.TrimSpace(emojiFree)
			if emojiFree != "" {
				msgCopy := msg
				msgCopy.CleanedMessage = emojiFree
				processedTopic = append(processedTopic, msgCopy)
			}
		}
		if len(processedTopic) > 0 {
			processedTopics = append(processedTopics, processedTopic)
		}
	}

	return processedTopics
}

func estimateTokens(text string) int {
	return int(float64(len(strings.Fields(text))) * 1.3)
}

func stratifyMessages(topics []Topic) map[string][]string {
	consolidatedMessages := make(map[string][]string)

	// group messages by sender, applying initial filters
	for _, topic := range topics {
		for _, msg := range topic {
			sender := msg.Sender
			messageText := msg.CleanedMessage

			trimmedMsg := strings.TrimSpace(messageText)
			if trimmedMsg == "" {
				continue
			}
			if len(strings.Fields(trimmedMsg)) < 3 {
				continue
			}
			isNumeric := true
			hasDigit := false
			for _, r := range trimmedMsg {
				if unicode.IsDigit(r) {
					hasDigit = true
				} else if !unicode.IsSpace(r) && r != '.' && r != ',' {
					isNumeric = false
					break
				}
			}
			if isNumeric && hasDigit {
				continue
			}

			hasAlphanum := false
			for _, r := range trimmedMsg {
				if unicode.IsLetter(r) || unicode.IsDigit(r) {
					hasAlphanum = true
					break
				}
			}
			if !hasAlphanum {
				continue
			}

			if containsExcessiveSpecialChars(trimmedMsg) {
				continue
			}

			if _, ok := consolidatedMessages[sender]; !ok {
				consolidatedMessages[sender] = []string{}
			}
			consolidatedMessages[sender] = append(consolidatedMessages[sender], trimmedMsg)
		}
	}

	// sample messages per sender
	finalSampled := make(map[string][]string)
	maxTokensPerSender := 500
	maxIndividualMessageLength := 600

	numSenders := len(consolidatedMessages)
	var maxMessagesPerSender int
	if numSenders == 2 {
		maxMessagesPerSender = 40
	} else if numSenders > 6 {
		maxMessagesPerSender = 15
	} else {
		maxMessagesPerSender = 25
	}

	senders := maps.Keys(consolidatedMessages)
	sort.Strings(senders)

	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for _, sender := range senders {
		msgs := consolidatedMessages[sender]
		eligibleMsgs := make([]string, 0, len(msgs))
		for _, msg := range msgs {
			if len(msg) <= maxIndividualMessageLength {
				eligibleMsgs = append(eligibleMsgs, msg)
			}
		}

		sort.SliceStable(eligibleMsgs, func(i, j int) bool {
			return len(eligibleMsgs[i]) > len(eligibleMsgs[j])
		})

		selectedMsgs := make([]string, 0, maxMessagesPerSender)
		totalTokens := 0
		potentialIndices := make([]int, len(eligibleMsgs))
		for i := range potentialIndices {
			potentialIndices[i] = i
		}
		longMessagePriorityProb := 0.7

		for len(selectedMsgs) < maxMessagesPerSender && len(potentialIndices) > 0 {
			prioritizeLong := r.Float64() < longMessagePriorityProb
			var chosenMsgIndexInEligible int
			var chosenIndexInPotential int

			if prioritizeLong {
				numCandidates := min(len(potentialIndices), 5)
				if numCandidates == 0 {
					break
				}
				chosenIndexInPotential = r.Intn(numCandidates)
			} else {
				chosenIndexInPotential = r.Intn(len(potentialIndices))
			}

			chosenMsgIndexInEligible = potentialIndices[chosenIndexInPotential]

			potentialIndices[chosenIndexInPotential] = potentialIndices[len(potentialIndices)-1]
			potentialIndices = potentialIndices[:len(potentialIndices)-1]

			// check token count
			msg := eligibleMsgs[chosenMsgIndexInEligible]
			tokenEst := estimateTokens(msg)

			if totalTokens+tokenEst <= maxTokensPerSender {
				selectedMsgs = append(selectedMsgs, msg)
				totalTokens += tokenEst
			}
		}

		if len(selectedMsgs) > 0 {
			r.Shuffle(len(selectedMsgs), func(i, j int) {
				selectedMsgs[i], selectedMsgs[j] = selectedMsgs[j], selectedMsgs[i]
			})
			finalSampled[sender] = selectedMsgs
		}
	}

	return finalSampled
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
