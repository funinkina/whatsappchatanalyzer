import re
import asyncio
import argparse
from collections import defaultdict, Counter
from datetime import datetime, timedelta
import emoji
from ai_analysis import analyze_messages_with_llm
from utils import preprocess_messages

async def analyze_chat(chat_file, convo_break_minutes=60):
    """
    Analyze WhatsApp chat and return statistics

    Args:
        chat_file (str): Path to the chat file
        convo_break_minutes (int): Minutes of inactivity to consider a new conversation
        stopwords_file (str): Path to stopwords file

    Returns:
        dict: Chat analysis results
    """
    messages_data = preprocess_messages(chat_file)

    ai_analysis_task = asyncio.create_task(analyze_messages_with_llm(messages_data))

    user_message_count = defaultdict(int)
    user_starts_convo = defaultdict(int)
    user_ignored_count = defaultdict(int)
    user_first_texts = Counter()
    word_counter = Counter()
    emoji_counter = Counter()
    user_messages = defaultdict(list)
    monthly_message_count = defaultdict(int)
    hourly_message_count = Counter()
    total_response_time_seconds = 0
    response_count = 0

    CONVO_BREAK_MINUTES = convo_break_minutes
    last_timestamp = None
    last_sender = None
    user_last_message = {}
    last_date = None
    current_convo_start = True

    for (timestamp, date, sender, filtered_message) in messages_data:
        is_new_convo = False
        if last_timestamp:
            time_diff = (timestamp - last_timestamp).total_seconds() / 60
            if time_diff > CONVO_BREAK_MINUTES:
                is_new_convo = True
                current_convo_start = True

            # Calculate response time if sender changed and within 12 hours
            if last_sender and sender != last_sender:
                response_diff_seconds = (timestamp - last_timestamp).total_seconds()
                if response_diff_seconds < 12 * 60 * 60:  # Less than 12 hours
                    total_response_time_seconds += response_diff_seconds
                    response_count += 1
        else:
            is_new_convo = True

        # Count conversation starts
        if current_convo_start:
            user_starts_convo[sender] += 1
            current_convo_start = False

        # Count messages per user
        user_message_count[sender] += 1

        # Store cleaned message for this user
        user_messages[sender].append(filtered_message)

        # Track first text of the day
        if date != last_date:
            user_first_texts[sender] += 1
            last_date = date

        # Count words (excluding stopwords and words with 1-2 characters)
        words = re.findall(r'\b\w{3,}\b', filtered_message.lower())
        word_counter.update(words)

        # Count emojis
        message_emojis = [char for char in filtered_message if char in emoji.EMOJI_DATA]
        emoji_counter.update(message_emojis)

        # Update last sender and timestamp
        last_sender = sender
        last_timestamp = timestamp

        # Count messages per month
        month_key = timestamp.strftime('%Y-%m')
        monthly_message_count[month_key] += 1

        # Count messages per hour
        hour_key = timestamp.hour
        hourly_message_count[hour_key] += 1

    user_ignored_count = defaultdict(int)
    previous_sender = None
    previous_timestamp = None

    for i, (timestamp, date, sender, filtered_message) in enumerate(messages_data):
        if i > 0:
            if previous_sender == sender:
                user_ignored_count[sender] += 1

        previous_sender = sender
        previous_timestamp = timestamp

    average_response_time_minutes = 0
    if response_count > 0:
        average_response_time_minutes = round((total_response_time_seconds / response_count) / 60, 2)

    total_messages = sum(user_message_count.values())
    most_active_users = {user: round((count / total_messages) * 100, 2) if total_messages > 0 else 0 for user, count in user_message_count.items()}
    conversation_starters = {user: round((count / sum(user_starts_convo.values())) * 100, 2) if sum(user_starts_convo.values()) > 0 else 0 for user, count in user_starts_convo.items()}
    total_ignored = sum(user_ignored_count.values())
    most_ignored_users = {user: round((count / total_ignored) * 100, 2) if total_ignored > 0 else 0 for user, count in user_ignored_count.items()}

    most_first_texter = user_first_texts.most_common(1)[0][0] if user_first_texts else "N/A"
    first_text_percentage = round((user_first_texts[most_first_texter] / sum(user_first_texts.values())) * 100, 2) if sum(user_first_texts.values()) > 0 else 0

    peak_hour = hourly_message_count.most_common(1)[0][0] if hourly_message_count else "N/A"

    monthly_activity = []
    today = datetime.now()
    start_date = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    for i in range(12):
        target_month = (start_date.replace(day=1) - timedelta(days=i * 30)).strftime('%Y-%m')
        current_year = today.year
        current_month = today.month
        target_month_num = current_month - i
        target_year = current_year
        while target_month_num <= 0:
            target_month_num += 12
            target_year -= 1
        target_month_key = f"{target_year}-{target_month_num:02d}"

        monthly_activity.append({
            "month": target_month_key,
            "count": monthly_message_count.get(target_month_key, 0)
        })

    monthly_activity.sort(key=lambda x: x['month'])

    ai_analysis = await ai_analysis_task

    results = {
        "most_active_users": dict(sorted(most_active_users.items(), key=lambda x: x[1], reverse=True)),
        "conversation_starters": dict(sorted(conversation_starters.items(), key=lambda x: x[1], reverse=True)),
        "most_ignored_users": dict(sorted(most_ignored_users.items(), key=lambda x: x[1], reverse=True)),
        "first_text_champion": {
            "user": most_first_texter,
            "percentage": first_text_percentage
        },
        "common_words": dict(word_counter.most_common(10)),
        "common_emojis": {emoji_char: count for emoji_char, count in emoji_counter.most_common(10)},
        "monthly_activity": monthly_activity,
        "average_response_time_minutes": average_response_time_minutes,
        "peak_hour": f"{peak_hour}:00 - {peak_hour + 1}:00" if isinstance(peak_hour, int) else peak_hour,
        "ai_analysis": ai_analysis,
    }

    return results
