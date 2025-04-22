import asyncio
import re
import json
import os
from collections import defaultdict, Counter
from datetime import timedelta
import emoji
from ai_analysis import analyze_messages_with_llm
from utils import preprocess_messages

async def analyze_chat(chat_file, original_filename=None):
    """
    Analyze WhatsApp chat and return statistics

    Args:
        chat_file (str): Path to the chat file
        original_filename (str, optional): Original filename before upload/temp storage
        convo_break_minutes (int): Minutes of inactivity to consider a new conversation
        stopwords_file (str): Path to stopwords file

    Returns:
        dict: Chat analysis results
    """
    chat_name = None
    print(f"Analyzing chat file: {chat_file}")

    if original_filename:
        filename = original_filename
        # print(f"Using original filename: {filename}")
    else:
        filename = os.path.basename(chat_file)
        print(f"Using basename from chat_file: {filename}")

    if filename.startswith("WhatsApp Chat with "):
        chat_name = filename.replace("WhatsApp Chat with ", "").replace(".txt", "")
    elif "with " in filename:
        chat_name = filename.split("with ")[1].replace(".txt", "")

    messages_data = preprocess_messages(chat_file)

    ai_analysis_task = asyncio.create_task(analyze_messages_with_llm(messages_data))

    user_message_count = defaultdict(int)
    user_starts_convo = defaultdict(int)
    user_first_texts = Counter()
    word_counter = Counter()
    emoji_counter = Counter()
    user_messages = defaultdict(list)
    daily_message_count_by_date = Counter()
    hourly_message_count = Counter()
    daily_message_count_by_weekday = Counter()
    monthly_activity_by_user = defaultdict(lambda: Counter())
    total_response_time_seconds = 0
    response_count = 0
    interaction_matrix = defaultdict(lambda: defaultdict(int))

    max_monologue_count = 0
    max_monologue_sender = None
    current_streak_count = 0
    current_streak_sender = None

    CONVO_BREAK_MINUTES = 60
    last_timestamp = None
    last_sender = None
    last_date_str = None
    current_convo_start = True
    all_months = set()

    first_message_timestamp = messages_data[0][0] if messages_data else None
    latest_message_timestamp = messages_data[-1][0] if messages_data else None

    for i, (timestamp, date_obj, sender, filtered_message) in enumerate(messages_data):
        if last_timestamp:
            time_diff = (timestamp - last_timestamp).total_seconds() / 60
            if time_diff > CONVO_BREAK_MINUTES:
                current_convo_start = True

            if last_sender and sender != last_sender:
                response_diff_seconds = (timestamp - last_timestamp).total_seconds()
                if response_diff_seconds < 12 * 60 * 60:
                    total_response_time_seconds += response_diff_seconds
                    response_count += 1
                interaction_matrix[last_sender][sender] += 1

        if current_convo_start:
            user_starts_convo[sender] += 1
            current_convo_start = False
        user_message_count[sender] += 1

        user_messages[sender].append(filtered_message)

        current_date_str = timestamp.strftime('%Y-%m-%d')
        if current_date_str != last_date_str:
            user_first_texts[sender] += 1
            last_date_str = current_date_str

        if sender == current_streak_sender:
            current_streak_count += 1
        else:
            if current_streak_sender is not None and current_streak_count > max_monologue_count:
                max_monologue_count = current_streak_count
                max_monologue_sender = current_streak_sender
            current_streak_sender = sender
            current_streak_count = 1

        # count words (excluding stopwords and words with 1-2 characters)
        words = re.findall(r'\b\w{3,}\b', filtered_message.lower())
        word_counter.update(words)

        # count emojis
        message_emojis = [char for char in filtered_message if char in emoji.EMOJI_DATA]
        emoji_counter.update(message_emojis)

        # update last sender and timestamp
        last_sender = sender
        last_timestamp = timestamp

        # count messages per specific date
        daily_message_count_by_date[current_date_str] += 1

        # count messages per hour
        hour_key = timestamp.hour
        hourly_message_count[hour_key] += 1

        # populate user monthly activity
        month_str = timestamp.strftime('%Y-%m')
        monthly_activity_by_user[sender][month_str] += 1
        all_months.add(month_str)  # Add month to the set

        # count messages per day of the week
        day_of_week = timestamp.weekday()
        daily_message_count_by_weekday[day_of_week] += 1

    if current_streak_sender is not None and current_streak_count > max_monologue_count:
        max_monologue_count = current_streak_count
        max_monologue_sender = current_streak_sender

    user_ignored_count = defaultdict(int)
    if len(messages_data) > 1:
        for i in range(1, len(messages_data)):
            previous_sender = messages_data[i - 1][2]
            current_sender = messages_data[i][2]
            if previous_sender == current_sender:
                user_ignored_count[current_sender] += 1

    average_response_time_minutes = 0
    if response_count > 0:
        average_response_time_minutes = round((total_response_time_seconds / response_count) / 60, 2)

    total_messages = sum(user_message_count.values())

    days_since_first_message = None
    if first_message_timestamp and latest_message_timestamp:
        days_since_first_message = (latest_message_timestamp.date() - first_message_timestamp.date()).days + 1  # Add 1 to include both start and end days

    most_active_users = {user: round((count / total_messages) * 100, 2) if total_messages > 0 else 0 for user, count in user_message_count.items()}
    conversation_starters = {user: round((count / sum(user_starts_convo.values())) * 100, 2) if sum(user_starts_convo.values()) > 0 else 0 for user, count in user_starts_convo.items()}
    total_ignored = sum(user_ignored_count.values())
    most_ignored_users = {user: round((count / total_ignored) * 100, 2) if total_ignored > 0 else 0 for user, count in user_ignored_count.items()}

    most_first_texter = user_first_texts.most_common(1)[0][0] if user_first_texts else "N/A"
    first_text_percentage = round((user_first_texts[most_first_texter] / sum(user_first_texts.values())) * 100, 2) if sum(user_first_texts.values()) > 0 else 0

    peak_hour = hourly_message_count.most_common(1)[0][0] if hourly_message_count else "N/A"

    # Format user monthly activity for Nivo heatmap
    user_monthly_stats = []
    sorted_months = sorted(list(all_months))
    all_users_list = sorted(list(user_message_count.keys()))\

    for user in all_users_list:
        user_data = []
        user_month_counts = monthly_activity_by_user.get(user, Counter())
        for month_str in sorted_months:
            count = user_month_counts.get(month_str, 0)
            user_data.append({"x": month_str, "y": count})
        user_monthly_stats.append({"id": user, "data": user_data})

    # calc avg weekday vs weekend
    total_weekday_messages = sum(daily_message_count_by_weekday[day] for day in range(5))
    total_weekend_messages = sum(daily_message_count_by_weekday[day] for day in range(5, 7))

    # avoid div by zero if mesg less than a week
    average_weekday_messages = round(total_weekday_messages / 5, 2) if total_weekday_messages > 0 else 0
    average_weekend_messages = round(total_weekend_messages / 2, 2) if total_weekend_messages > 0 else 0

    ai_analysis = await ai_analysis_task
    if ai_analysis is None:
        ai_analysis = {
            "summary": "No AI analysis available for this chat.",
            "people": []
        }
    else:
        try:
            ai_analysis = json.loads(ai_analysis)
        except json.JSONDecodeError as e:
            print(f"Error parsing AI analysis JSON: {e}")
            ai_analysis = {
                "summary": "Error parsing AI analysis.",
                "people": []
            }
    nivo_interaction_matrix = None
    if len(user_message_count) > 1:
        matrix_header = [None] + all_users_list
        nivo_interaction_matrix = [matrix_header]
        for sender in all_users_list:
            row = [sender]
            for target_user in all_users_list:
                count = interaction_matrix[sender].get(target_user, 0)
                row.append(count)
            nivo_interaction_matrix.append(row)

    results = {
        "chat_name": chat_name,
        "total_messages": total_messages,
        "days_since_first_message": days_since_first_message,
        "most_active_users": dict(sorted(most_active_users.items(), key=lambda x: x[1], reverse=True)),
        "conversation_starters": dict(sorted(conversation_starters.items(), key=lambda x: x[1], reverse=True)),
        "most_ignored_users": dict(sorted(most_ignored_users.items(), key=lambda x: x[1], reverse=True)),
        "first_text_champion": {
            "user": most_first_texter,
            "percentage": first_text_percentage
        },
        "longest_monologue": {
            "user": max_monologue_sender if max_monologue_sender else None,
            "count": max_monologue_count
        },
        "common_words": dict(word_counter.most_common(10)),
        "common_emojis": {emoji_char: count for emoji_char, count in emoji_counter.most_common(6)},
        "average_response_time_minutes": average_response_time_minutes,
        "peak_hour": f"{peak_hour}:00 - {peak_hour + 1}:00" if isinstance(peak_hour, int) else peak_hour,
        "user_monthly_activity": user_monthly_stats,
        "weekday_vs_weekend_avg": {
            "average_weekday_messages": average_weekday_messages,
            "average_weekend_messages": average_weekend_messages,
            "difference": round(average_weekday_messages - average_weekend_messages, 2),
            "percentage_difference": round(((average_weekday_messages - average_weekend_messages) / average_weekday_messages) * 100, 2) if average_weekday_messages > 0 else 0
        },
        "ai_analysis": ai_analysis,
        "user_interaction_matrix": nivo_interaction_matrix if len(user_message_count) > 1 else None
    }

    return results
