package main

import (
	"fmt"
	"log"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"golang.org/x/exp/maps"
)

type UserMessageCount map[string]int

type PercentageMap map[string]float64

type StringIntMap map[string]int

type UserStringIntMap map[string]map[string]int

type InteractionMatrix map[string]map[string]int

type NivoPoint struct {
	X string `json:"x"`
	Y int    `json:"y"`
}

type NivoLineData struct {
	ID   string      `json:"id"`
	Data []NivoPoint `json:"data"`
}

type WeekdayWeekendAverage struct {
	AverageWeekdayMessages float64 `json:"average_weekday_messages"`
	AverageWeekendMessages float64 `json:"average_weekend_messages"`
	Difference             float64 `json:"difference"`
	PercentageDifference   float64 `json:"percentage_difference"`
}

type ChampionInfo struct {
	User  string `json:"user"`
	Count int    `json:"count"`
}

type ChatStatistics struct {
	TotalMessages              int                   `json:"total_messages"`
	DaysActive                 int                   `json:"days_active"`
	UserMessageCount           UserMessageCount      `json:"user_message_count"`
	MostActiveUsersPct         PercentageMap         `json:"most_active_users_pct"`
	ConversationStartersPct    PercentageMap         `json:"conversation_starters_pct"`
	MostIgnoredUsersPct        PercentageMap         `json:"most_ignored_users_pct"`
	FirstTextChampion          ChampionInfo          `json:"first_text_champion"`
	LongestMonologue           ChampionInfo          `json:"longest_monologue"`
	CommonWords                StringIntMap          `json:"common_words"`
	CommonEmojis               StringIntMap          `json:"common_emojis"`
	AverageResponseTimeMinutes float64               `json:"average_response_time_minutes"`
	PeakHour                   *int                  `json:"peak_hour"`
	UserMonthlyActivity        []NivoLineData        `json:"user_monthly_activity"`
	WeekdayVsWeekendAvg        WeekdayWeekendAverage `json:"weekday_vs_weekend_avg"`
	UserInteractionMatrix      [][]interface{}       `json:"user_interaction_matrix,omitempty"`
}

func calculatePercentile(sortedData []float64, p float64) float64 {
	n := len(sortedData)
	if n == 0 {
		return 0 // Or handle as error
	}
	if p <= 0 {
		return sortedData[0]
	}
	if p >= 100 {
		return sortedData[n-1]
	}

	rank := (p / 100.0) * float64(n+1)

	k := int(rank)
	d := rank - float64(k)

	if k == 0 {
		return sortedData[0]
	}
	if k >= n {
		return sortedData[n-1]
	}

	valKMinus1 := sortedData[k-1]
	valK := sortedData[k]

	return valKMinus1 + d*(valK-valK)
}

func calculateDynamicConvoBreak(messagesData []ParsedMessage, defaultBreakMinutes, minBreak, maxBreak int) int {
	responseTimesMinutes := []float64{}
	var lastTimestamp time.Time
	var lastSender string
	firstTimestampProcessed := false

	for _, msg := range messagesData {
		if firstTimestampProcessed && lastSender != "" && msg.Sender != lastSender {
			timeDiffSeconds := msg.Timestamp.Sub(lastTimestamp).Seconds()

			if timeDiffSeconds > 5 && timeDiffSeconds < (12*3600) {
				responseTimesMinutes = append(responseTimesMinutes, timeDiffSeconds/60.0)
			}
		}
		lastTimestamp = msg.Timestamp
		lastSender = msg.Sender
		firstTimestampProcessed = true
	}

	if len(responseTimesMinutes) < 20 {
		log.Printf("Not enough response time data (%d points) for dynamic break, using default: %d mins", len(responseTimesMinutes), defaultBreakMinutes)
		return defaultBreakMinutes
	}

	sort.Float64s(responseTimesMinutes)

	p85 := calculatePercentile(responseTimesMinutes, 85.0)

	dynamicBreak := p85 + 30

	dynamicBreakClamped := math.Max(float64(minBreak), math.Min(dynamicBreak, float64(maxBreak)))

	result := int(math.Round(dynamicBreakClamped))
	// log.Printf("Calculated dynamic conversation break: %d minutes (based on p85=%.2f)", result, p85)
	return result
}

func countTopN(counter map[string]int, n int) StringIntMap {
	type kv struct {
		Key   string
		Value int
	}
	var ss []kv
	for k, v := range counter {
		ss = append(ss, kv{k, v})
	}

	sort.Slice(ss, func(i, j int) bool {
		return ss[i].Value > ss[j].Value
	})

	topN := make(StringIntMap)
	count := 0
	for _, pair := range ss {
		if count >= n {
			break
		}
		topN[pair.Key] = pair.Value
		count++
	}
	return topN
}

// main stats calculation function

func calculateChatStatistics(messagesData []ParsedMessage, convoBreakMinutes int) (*ChatStatistics, error) {
	// log.Printf("Starting statistics calculation for %d messages...", len(messagesData))
	if len(messagesData) == 0 {
		return nil, fmt.Errorf("cannot calculate statistics on empty message list")
	}

	userMessageCount := make(UserMessageCount)
	userStartsConvo := make(map[string]int)
	userFirstTexts := make(map[string]int) // Count per day
	wordCounter := make(map[string]int)
	emojiCounter := make(map[string]int) // Counts distinct emojis per message

	dailyMessageCountByDate := make(map[string]int) // YYYY-MM-DD -> count
	hourlyMessageCount := make(map[int]int)         // 0-23 -> count
	dailyMessageCountByWeekday := make(map[int]int) // 0 (Sun) - 6 (Sat) -> count
	monthlyActivityByUser := make(UserStringIntMap) // user -> month (YYYY-MM) -> count

	totalResponseTimeSeconds := 0.0
	responseCount := 0
	interactionMatrix := make(InteractionMatrix)

	maxMonologueCount := 0
	maxMonologueSender := ""
	currentStreakCount := 0
	currentStreakSender := ""

	var lastTimestamp time.Time
	var lastSender string
	var lastDateStr string
	currentConvoStartSender := ""
	allMonths := make(map[string]struct{})
	userIgnoredCount := make(map[string]int)

	firstMessageTimestamp := messagesData[0].Timestamp
	latestMessageTimestamp := messagesData[len(messagesData)-1].Timestamp

	wordRegex := regexp.MustCompile(`\b[a-zA-Z0-9]{3,}\b`)

	convoBreakDuration := time.Duration(convoBreakMinutes) * time.Minute

	for i, msg := range messagesData {
		isNewConvo := false
		isFirstMessage := (i == 0)

		if !isFirstMessage {
			timeDiff := msg.Timestamp.Sub(lastTimestamp)
			if timeDiff > convoBreakDuration {
				isNewConvo = true
				currentConvoStartSender = msg.Sender // This message starts a new convo
			} else if lastSender != "" && msg.Sender != lastSender {
				responseDiffSeconds := timeDiff.Seconds()
				if responseDiffSeconds > 5 && responseDiffSeconds < (12*3600) {
					totalResponseTimeSeconds += responseDiffSeconds
					responseCount++
				}
				if _, ok := interactionMatrix[lastSender]; !ok {
					interactionMatrix[lastSender] = make(map[string]int)
				}
				interactionMatrix[lastSender][msg.Sender]++
			}
		} else {
			isNewConvo = true
			currentConvoStartSender = msg.Sender
		}

		if isNewConvo && currentConvoStartSender != "" {
			userStartsConvo[currentConvoStartSender]++
			currentConvoStartSender = ""
		}

		userMessageCount[msg.Sender]++

		// first text per day
		currentDateStr := msg.Timestamp.Format("2006-01-02")
		if currentDateStr != lastDateStr {
			userFirstTexts[msg.Sender]++
			lastDateStr = currentDateStr
		}

		// monologue
		if msg.Sender == currentStreakSender {
			currentStreakCount++
		} else {
			// End of previous streak
			if currentStreakSender != "" && currentStreakCount > maxMonologueCount {
				maxMonologueCount = currentStreakCount
				maxMonologueSender = currentStreakSender
			}
			currentStreakSender = msg.Sender
			currentStreakCount = 1
		}

		words := wordRegex.FindAllString(strings.ToLower(msg.CleanedMessage), -1)
		for _, word := range words {
			if _, isStopword := stopwordsSet[word]; !isStopword {
				wordCounter[word]++
			}
		}

		foundEmojis := emojiPattern.FindAllString(msg.OriginalMessage, -1)
		for _, emojiMatch := range foundEmojis {
			runes := []rune(emojiMatch)
			for i := 0; i < len(runes); i++ {
				currentEmoji := string(runes[i])

				if i+1 < len(runes) {
					nextRune := runes[i+1]
					if unicode.Is(unicode.Mn, nextRune) || unicode.Is(unicode.Sk, nextRune) ||
						(nextRune >= 0x1F3FB && nextRune <= 0x1F3FF) {
						currentEmoji += string(nextRune)
						i++
					}
				}

				emojiCounter[currentEmoji]++
			}
		}

		dailyMessageCountByDate[currentDateStr]++
		hourlyMessageCount[msg.Timestamp.Hour()]++
		dailyMessageCountByWeekday[int(msg.Timestamp.Weekday())]++

		monthStr := msg.Timestamp.Format("2006-01")
		if _, ok := monthlyActivityByUser[msg.Sender]; !ok {
			monthlyActivityByUser[msg.Sender] = make(map[string]int)
		}
		monthlyActivityByUser[msg.Sender][monthStr]++
		allMonths[monthStr] = struct{}{}

		if i+1 < len(messagesData) && messagesData[i+1].Sender == msg.Sender {
			userIgnoredCount[msg.Sender]++
		}

		lastSender = msg.Sender
		lastTimestamp = msg.Timestamp

	}

	if currentStreakSender != "" && currentStreakCount > maxMonologueCount {
		maxMonologueCount = currentStreakCount
		maxMonologueSender = currentStreakSender
	}

	totalMessages := len(messagesData)

	mostActiveUsersPct := make(PercentageMap)
	for user, count := range userMessageCount {
		mostActiveUsersPct[user] = roundFloat(float64(count)*100.0/float64(totalMessages), 2)
	}

	totalStarts := 0
	for _, count := range userStartsConvo {
		totalStarts += count
	}
	conversationStartersPct := make(PercentageMap)
	if totalStarts > 0 {
		for user, count := range userStartsConvo {
			conversationStartersPct[user] = roundFloat(float64(count)*100.0/float64(totalStarts), 2)
		}
	}

	totalIgnored := 0
	for _, count := range userIgnoredCount {
		totalIgnored += count
	}
	mostIgnoredUsersPct := make(PercentageMap)
	if totalIgnored > 0 {
		for user, count := range userIgnoredCount {
			mostIgnoredUsersPct[user] = roundFloat(float64(count)*100.0/float64(totalIgnored), 2)
		}
	}

	// first texter
	firstTextChampion := ChampionInfo{}
	maxFirstTexts := -1
	for user, count := range userFirstTexts {
		if count > maxFirstTexts {
			maxFirstTexts = count
			firstTextChampion.User = user
			firstTextChampion.Count = count
		}
	}

	// avg response time
	averageResponseTimeMinutes := 0.0
	if responseCount > 0 {
		averageResponseTimeMinutes = roundFloat((totalResponseTimeSeconds/float64(responseCount))/60.0, 2)
	}

	// peak hour
	var peakHour *int
	maxHourCount := -1
	for hour, count := range hourlyMessageCount {
		if count > maxHourCount {
			maxHourCount = count
			h := hour
			peakHour = &h
		}
	}

	// days active
	daysActive := 0
	if !firstMessageTimestamp.IsZero() && !latestMessageTimestamp.IsZero() {
		daysActive = int(latestMessageTimestamp.Sub(firstMessageTimestamp).Hours()/24) + 1
	}

	stats := &ChatStatistics{
		TotalMessages:              totalMessages,
		DaysActive:                 daysActive,
		UserMessageCount:           userMessageCount,
		MostActiveUsersPct:         mostActiveUsersPct,
		ConversationStartersPct:    conversationStartersPct,
		MostIgnoredUsersPct:        mostIgnoredUsersPct,
		FirstTextChampion:          firstTextChampion,
		LongestMonologue:           ChampionInfo{User: maxMonologueSender, Count: maxMonologueCount},
		CommonWords:                countTopN(wordCounter, 10),
		CommonEmojis:               countTopN(emojiCounter, 6),
		AverageResponseTimeMinutes: averageResponseTimeMinutes,
		PeakHour:                   peakHour,
		UserMonthlyActivity:        getMonthlyActivity(monthlyActivityByUser, allMonths, maps.Keys(userMessageCount)),
		WeekdayVsWeekendAvg:        calcWeekdayWeekendAvg(dailyMessageCountByWeekday),
		UserInteractionMatrix:      formatInteractionMatrix(interactionMatrix, maps.Keys(userMessageCount)),
	}

	return stats, nil
}

func getMonthlyActivity(monthlyActivityByUser UserStringIntMap, allMonths map[string]struct{}, allUsersList []string) []NivoLineData {
	if len(allMonths) == 0 || len(allUsersList) == 0 {
		return []NivoLineData{}
	}

	userMonthlyStats := []NivoLineData{}
	sortedMonths := maps.Keys(allMonths)
	sort.Strings(sortedMonths)
	sort.Strings(allUsersList)

	for _, user := range allUsersList {
		userData := []NivoPoint{}
		userActivity, userExists := monthlyActivityByUser[user]
		for _, monthStr := range sortedMonths {
			count := 0
			if userExists {
				count = userActivity[monthStr]
			}
			userData = append(userData, NivoPoint{X: monthStr, Y: count})
		}
		userMonthlyStats = append(userMonthlyStats, NivoLineData{ID: user, Data: userData})
	}
	return userMonthlyStats
}

func calcWeekdayWeekendAvg(dailyMessageCountByWeekday map[int]int) WeekdayWeekendAverage {
	totalWeekday := 0
	totalWeekend := 0

	// Weekdays: Monday (1) to Friday (5) in Go's time.Weekday
	for day := 1; day <= 5; day++ {
		totalWeekday += dailyMessageCountByWeekday[day]
	}
	// Weekends: Sunday (0) and Saturday (6)
	totalWeekend += dailyMessageCountByWeekday[0] // Sunday
	totalWeekend += dailyMessageCountByWeekday[6] // Saturday

	avgWeekday := 0.0
	if totalWeekday > 0 {
		avgWeekday = roundFloat(float64(totalWeekday)/5.0, 2)
	}

	avgWeekend := 0.0
	if totalWeekend > 0 {
		avgWeekend = roundFloat(float64(totalWeekend)/2.0, 2)
	}

	diff := roundFloat(avgWeekday-avgWeekend, 2)
	pctDiff := 0.0
	if avgWeekday > 0 {
		pctDiff = roundFloat((diff/avgWeekday)*100.0, 2)
	}

	return WeekdayWeekendAverage{
		AverageWeekdayMessages: avgWeekday,
		AverageWeekendMessages: avgWeekend,
		Difference:             diff,
		PercentageDifference:   pctDiff,
	}
}

func formatInteractionMatrix(interactionMatrix InteractionMatrix, allUsersList []string) [][]interface{} {
	if len(allUsersList) <= 1 {
		return nil
	}

	sortedUsers := make([]string, len(allUsersList))
	copy(sortedUsers, allUsersList)
	sort.Strings(sortedUsers)

	matrixHeader := make([]interface{}, len(sortedUsers)+1)
	matrixHeader[0] = nil
	for i, user := range sortedUsers {
		matrixHeader[i+1] = user
	}

	listOfListsMatrix := [][]interface{}{matrixHeader}

	for _, sender := range sortedUsers {
		row := make([]interface{}, len(sortedUsers)+1)
		row[0] = sender

		senderInteractions, senderExists := interactionMatrix[sender]
		for j, target := range sortedUsers {
			count := 0
			if senderExists {
				count = senderInteractions[target]
			}
			row[j+1] = count
		}
		listOfListsMatrix = append(listOfListsMatrix, row)
	}

	return listOfListsMatrix
}

func roundFloat(val float64, precision uint) float64 {
	ratio := math.Pow(10, float64(precision))
	return math.Round(val*ratio) / ratio
}
