package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	maxLinesToSniff         = 100
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

		"2/1/06 3:04 PM",        // d/m/yy h:mm AM/PM
		"2/1/2006 3:04 PM",      // d/m/yyyy h:mm AM/PM
		"2/1/06 3:04:05 PM",     // d/m/yy h:mm:ss AM/PM
		"2/1/2006 3:04:05 PM",   // d/m/yyyy h:mm:ss AM/PM
		"02/01/06 3:04 PM",      // dd/mm/yy h:mm AM/PM
		"02/01/2006 3:04 PM",    // dd/mm/yyyy h:mm AM/PM
		"02/01/06 3:04:05 PM",   // dd/mm/yy h:mm:ss AM/PM
		"02/01/2006 3:04:05 PM", // dd/mm/yyyy h:mm:ss AM/PM
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

	lowerCasePatterns := make([]string, len(patterns))
	for i, p := range patterns {
		lowerCasePatterns[i] = strings.ToLower(p)
	}
	log.Printf("Loaded %d system message patterns from %s", len(lowerCasePatterns), filepath)
	return lowerCasePatterns, nil
}

func sniffTimestampLayouts(reader io.Reader, allLayouts []string, maxLines int) ([]string, error) {
	scanner := bufio.NewScanner(reader)
	var sampleLines []string
	linesRead := 0

	for (maxLines <= 0 || linesRead < maxLines) && scanner.Scan() {
		line := scanner.Text()
		trimmedLine := strings.TrimSpace(line)
		trimmedLine = strings.TrimPrefix(trimmedLine, "\u200e")

		if timestampPattern != nil && timestampPattern.MatchString(trimmedLine) {
			sampleLines = append(sampleLines, trimmedLine)
		}
		linesRead++
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading lines for sniffing: %w", err)
	}

	if len(sampleLines) == 0 {
		// log.Printf("Warning: No lines matched the general timestamp pattern during sniffing in the first %d lines. Cannot determine specific layout.", maxLines)
		return nil, fmt.Errorf("no valid timestamp lines found in the first %d lines to sniff format from", maxLines)
	}

	candidateLayouts := make([]string, len(allLayouts))
	copy(candidateLayouts, allLayouts)

	actualTimestampsProcessed := 0

	for _, line := range sampleLines {
		if len(candidateLayouts) == 0 {
			break
		}

		match := timestampPattern.FindStringSubmatch(line)
		if match == nil || len(match) != 5 {
			continue
		}
		actualTimestampsProcessed++

		dateStr := strings.TrimSpace(match[1])
		timeStr := strings.TrimSpace(match[2])
		timeCleaned := strings.ToUpper(strings.ReplaceAll(timeStr, "\u202f", " "))
		datetimeStr := dateStr + " " + timeCleaned

		currentlyValidLayouts := []string{}
		for _, layout := range candidateLayouts {
			_, err := time.Parse(layout, datetimeStr)
			if err == nil {
				currentlyValidLayouts = append(currentlyValidLayouts, layout)
			}
		}
		candidateLayouts = currentlyValidLayouts
	}

	if actualTimestampsProcessed == 0 {
		log.Println("Warning: No actual timestamps were successfully parsed from the sampled lines.")
		return nil, fmt.Errorf("no timestamp lines could be parsed with any layout from the sample")
	}

	if len(candidateLayouts) == 0 {
		// log.Printf("Sniffing failed: No layout consistently parsed %d sampled timestamp lines.", actualTimestampsProcessed)
		return nil, fmt.Errorf("no timestamp layout consistently parsed the sample data")
	}

	if len(candidateLayouts) > 1 {
		// log.Printf("Multiple layouts (%d) are consistent with sniffed data: %v. Applying prioritization.", len(candidateLayouts), candidateLayouts)

		var europeanStyleLayouts []string
		var usStyleLayouts []string

		for _, layout := range candidateLayouts {
			if strings.Contains(layout, "2/1/") || strings.Contains(layout, "02/01/") {
				europeanStyleLayouts = append(europeanStyleLayouts, layout)
			} else if strings.Contains(layout, "1/2/") || strings.Contains(layout, "01/02/") {
				usStyleLayouts = append(usStyleLayouts, layout)
			}
		}

		if len(europeanStyleLayouts) > 0 {
			// log.Printf("Prioritizing European-style (d/m or dd/mm) layouts as they are among consistent options: %v", europeanStyleLayouts)
			return europeanStyleLayouts, nil
		}
		if len(usStyleLayouts) > 0 {
			// log.Printf("Using US-style (m/d or mm/dd) layouts as they are the only consistent options: %v", usStyleLayouts)
			return usStyleLayouts, nil
		}

		// log.Printf("Could not strongly prioritize among consistent layouts. Using all: %v", candidateLayouts)
		return candidateLayouts, nil
	}

	log.Printf("Determined single consistent timestamp layout(s): %v", candidateLayouts)
	return candidateLayouts, nil
}

func preprocessMessages(reader io.Reader) (int, []ParsedMessage, error) {
	buf, err := io.ReadAll(reader)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read input for buffering: %w", err)
	}

	sniffReader := bytes.NewReader(buf)
	currentTimestampParseLayouts, err := sniffTimestampLayouts(sniffReader, timestampParseLayouts, maxLinesToSniff)

	if err != nil || len(currentTimestampParseLayouts) == 0 {
		log.Printf("Warning: Timestamp sniffing failed (%v) or returned no layouts. Falling back to all %d global layouts.", err, len(timestampParseLayouts))
		currentTimestampParseLayouts = timestampParseLayouts
		if len(currentTimestampParseLayouts) == 0 {
			return 0, nil, errors.New("no timestamp layouts available even in global list")
		}
	} else {
		log.Printf("Using determined timestamp layouts for parsing: %v", currentTimestampParseLayouts)
	}

	messagesData := []ParsedMessage{}
	mainScanner := bufio.NewScanner(bytes.NewReader(buf))
	lineNumber := 0
	rawMessageCount := 0

	for mainScanner.Scan() {
		lineNumber++
		line := mainScanner.Text()
		line = strings.TrimSpace(line)

		if line == "" {
			continue
		}
		rawMessageCount++

		line = strings.TrimPrefix(line, "\u200e")

		if timestampPattern == nil {
			return rawMessageCount, nil, fmt.Errorf("timestampPattern regex is not initialized")
		}
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
		lowerCaseMessage := strings.ToLower(message)
		for _, pattern := range systemMessagePatterns {
			if strings.Contains(lowerCaseMessage, pattern) {
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

		for _, layout := range currentTimestampParseLayouts {
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
			log.Printf("Line %d: Failed to parse timestamp '%s' with available layouts.", lineNumber, datetimeStr)
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
		} else {
		}
	}

	if err := mainScanner.Err(); err != nil {
		return rawMessageCount, messagesData, fmt.Errorf("error reading data stream: %w", err)
	}

	log.Printf("Preprocessing complete. Raw messages counted: %d, Parsed messages for analysis: %d", rawMessageCount, len(messagesData))

	return rawMessageCount, messagesData, nil
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

func stratifyMessages(topics []Topic) map[string][]string {
	consolidatedMessages := make(map[string][]string)

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

	finalSampled := make(map[string][]string)
	maxMessagesPerSender := 23

	senders := maps.Keys(consolidatedMessages)
	sort.Strings(senders)

	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for _, sender := range senders {
		msgs := consolidatedMessages[sender]
		eligibleMsgs := make([]string, 0, len(msgs))
		for _, msg := range msgs {
			if len(strings.Fields(msg)) > 7 {
				eligibleMsgs = append(eligibleMsgs, msg)
			}
		}

		if len(eligibleMsgs) > 0 {
			r.Shuffle(len(eligibleMsgs), func(i, j int) {
				eligibleMsgs[i], eligibleMsgs[j] = eligibleMsgs[j], eligibleMsgs[i]
			})

			selectedMsgs := eligibleMsgs
			if len(eligibleMsgs) > maxMessagesPerSender {
				selectedMsgs = eligibleMsgs[:maxMessagesPerSender]
			}

			finalSampled[sender] = selectedMsgs
		}
	}

	return finalSampled
}

func extractDisplayNames(users []string) []string {
	var displayNames []string
	for _, user := range users {
		trimmedUser := strings.TrimSpace(user)
		if trimmedUser == "" {
			continue
		}

		isName := false
		for _, r := range trimmedUser {
			if unicode.IsLetter(r) {
				isName = true
				break
			}
		}

		if isName {
			parts := strings.Fields(trimmedUser)
			if len(parts) > 0 {
				firstNameCandidate := parts[0]
				hasLetterInFirstName := false
				for _, r := range firstNameCandidate {
					if unicode.IsLetter(r) {
						hasLetterInFirstName = true
						break
					}
				}

				if hasLetterInFirstName {
					displayNames = append(displayNames, firstNameCandidate)
				}
			}
		}
	}
	return displayNames
}
