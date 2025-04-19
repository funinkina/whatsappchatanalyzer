import asyncio
import re
from collections import defaultdict, Counter
from datetime import datetime, timedelta
import emoji
from ai_analysis import analyze_messages_with_llm
from utils import preprocess_messages

async def analyze_chat(chat_file):
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
    # user_ignored_count = defaultdict(int) # This is calculated later
    user_first_texts = Counter()
    word_counter = Counter()
    emoji_counter = Counter()
    user_messages = defaultdict(list)
    daily_message_count_by_date = Counter()  # Added for daily activity
    hourly_message_count = Counter()
    daily_message_count_by_weekday = Counter()  # Count messages per day of the week (0=Monday, 6=Sunday)
    monthly_activity_by_user = defaultdict(lambda: Counter())  # For user monthly activity heatmap
    total_response_time_seconds = 0
    response_count = 0
    interaction_matrix = defaultdict(lambda: defaultdict(int))

    # Variables for longest monologue
    max_monologue_count = 0
    max_monologue_sender = None
    current_streak_count = 0
    current_streak_sender = None

    CONVO_BREAK_MINUTES = 60
    last_timestamp = None
    last_sender = None
    user_last_message = {}
    last_date_str = None  # Changed from last_date
    current_convo_start = True
    all_months = set()  # Keep track of all months present in the chat

    # Track the first and latest message timestamps
    first_message_timestamp = messages_data[0][0] if messages_data else None
    latest_message_timestamp = messages_data[-1][0] if messages_data else None

    for i, (timestamp, date_obj, sender, filtered_message) in enumerate(messages_data):  # Renamed date to date_obj
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
                # Track interactions (User A's message followed by User B's)
                interaction_matrix[last_sender][sender] += 1
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
        current_date_str = timestamp.strftime('%Y-%m-%d')  # Use timestamp for consistency
        if current_date_str != last_date_str:
            user_first_texts[sender] += 1
            last_date_str = current_date_str

        # Track longest monologue (consecutive messages)
        if sender == current_streak_sender:
            current_streak_count += 1
        else:
            # Check if the previous streak was the longest
            if current_streak_sender is not None and current_streak_count > max_monologue_count:
                max_monologue_count = current_streak_count
                max_monologue_sender = current_streak_sender
            # Start new streak
            current_streak_sender = sender
            current_streak_count = 1

        # Count words (excluding stopwords and words with 1-2 characters)
        words = re.findall(r'\b\w{3,}\b', filtered_message.lower())
        word_counter.update(words)

        # Count emojis
        message_emojis = [char for char in filtered_message if char in emoji.EMOJI_DATA]
        emoji_counter.update(message_emojis)

        # Update last sender and timestamp
        last_sender = sender
        last_timestamp = timestamp

        # Count messages per specific date
        daily_message_count_by_date[current_date_str] += 1

        # Count messages per hour
        hour_key = timestamp.hour
        hourly_message_count[hour_key] += 1

        # Populate User Monthly Activity
        month_str = timestamp.strftime('%Y-%m')
        monthly_activity_by_user[sender][month_str] += 1
        all_months.add(month_str)  # Add month to the set

        # Count messages per day of the week
        day_of_week = timestamp.weekday()  # Still needed for weekday/weekend avg
        daily_message_count_by_weekday[day_of_week] += 1

    # Final check for the last monologue streak after the loop
    if current_streak_sender is not None and current_streak_count > max_monologue_count:
        max_monologue_count = current_streak_count
        max_monologue_sender = current_streak_sender

    # Calculate ignored count (consecutive messages from the same user)
    # Note: This is similar but distinct from monologue count. Ignored counts *pairs* of consecutive messages.
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

    # Calculate days since first message if data exists
    days_since_first_message = None
    if first_message_timestamp and latest_message_timestamp:
        # Calculate difference between the dates only, ignoring time
        days_since_first_message = (latest_message_timestamp.date() - first_message_timestamp.date()).days + 1  # Add 1 to include both start and end days

    most_active_users = {user: round((count / total_messages) * 100, 2) if total_messages > 0 else 0 for user, count in user_message_count.items()}
    conversation_starters = {user: round((count / sum(user_starts_convo.values())) * 100, 2) if sum(user_starts_convo.values()) > 0 else 0 for user, count in user_starts_convo.items()}
    total_ignored = sum(user_ignored_count.values())
    most_ignored_users = {user: round((count / total_ignored) * 100, 2) if total_ignored > 0 else 0 for user, count in user_ignored_count.items()}

    most_first_texter = user_first_texts.most_common(1)[0][0] if user_first_texts else "N/A"
    first_text_percentage = round((user_first_texts[most_first_texter] / sum(user_first_texts.values())) * 100, 2) if sum(user_first_texts.values()) > 0 else 0

    peak_hour = hourly_message_count.most_common(1)[0][0] if hourly_message_count else "N/A"

    # Generate daily activity data
    daily_activity = []
    if first_message_timestamp and latest_message_timestamp:
        current_date = first_message_timestamp.date()
        end_date = latest_message_timestamp.date()
        delta = timedelta(days=1)
        while current_date <= end_date:
            date_str = current_date.strftime('%Y-%m-%d')
            daily_activity.append({
                "day": date_str,
                "value": daily_message_count_by_date.get(date_str, 0)
            })
            current_date += delta
    # Ensure daily_activity is sorted by date (it should be already, but just in case)
    daily_activity.sort(key=lambda x: x['day'])

    # Format user monthly activity for Nivo heatmap
    nivo_user_monthly_activity = []
    sorted_months = sorted(list(all_months))  # Ensure months are chronological
    all_users_list = sorted(list(user_message_count.keys()))  # Get all users sorted

    for user in all_users_list:
        user_data = []
        user_month_counts = monthly_activity_by_user.get(user, Counter())  # Get user's monthly counts or empty Counter
        for month_str in sorted_months:
            count = user_month_counts.get(month_str, 0)  # Get count for the month, default 0
            user_data.append({"x": month_str, "y": count})
        nivo_user_monthly_activity.append({"id": user, "data": user_data})

    # Calculate average messages per weekday vs weekend day
    total_weekday_messages = sum(daily_message_count_by_weekday[day] for day in range(5))  # Monday to Friday
    total_weekend_messages = sum(daily_message_count_by_weekday[day] for day in range(5, 7))  # Saturday and Sunday

    # Avoid division by zero if the chat spans less than a full week or has no messages on weekdays/weekends
    average_weekday_messages = round(total_weekday_messages / 5, 2) if total_weekday_messages > 0 else 0
    average_weekend_messages = round(total_weekend_messages / 2, 2) if total_weekend_messages > 0 else 0

    ai_analysis = await ai_analysis_task
    if ai_analysis is None:
        ai_analysis = "Unable to retrieve AI analysis."

    # Prepare user interaction matrix for Nivo heatmap if more than 1 user
    nivo_interaction_matrix = None
    # A heatmap makes sense even for 2 users to see the interaction pattern.
    if len(user_message_count) > 1:
        nivo_interaction_matrix = []
        for sender in all_users_list:
            sender_data = []
            # Ensure data exists for every user pair, even if count is 0
            for target_user in all_users_list:
                # Get interaction count from sender to target_user
                # interaction_matrix[sender] is a defaultdict(int), so .get() handles missing targets gracefully
                count = interaction_matrix[sender].get(target_user, 0)
                sender_data.append({"x": target_user, "y": count})
            nivo_interaction_matrix.append({"id": sender, "data": sender_data})

    results = {
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
        "common_emojis": {emoji_char: count for emoji_char, count in emoji_counter.most_common(10)},
        "daily_activity": daily_activity,  # Changed from monthly_activity
        "average_response_time_minutes": average_response_time_minutes,
        "peak_hour": f"{peak_hour}:00 - {peak_hour + 1}:00" if isinstance(peak_hour, int) else peak_hour,
        "user_monthly_activity": nivo_user_monthly_activity,  # Added user monthly activity
        "weekday_vs_weekend_avg": {
            "average_weekday_messages": average_weekday_messages,
            "average_weekend_messages": average_weekend_messages,
            "difference": round(average_weekday_messages - average_weekend_messages, 2),
            # Optional: Calculate percentage difference relative to weekday average
            "percentage_difference": round(((average_weekday_messages - average_weekend_messages) / average_weekday_messages) * 100, 2) if average_weekday_messages > 0 else 0
        },
        "ai_analysis": ai_analysis,
        "user_interaction_matrix": nivo_interaction_matrix
    }

    return results
