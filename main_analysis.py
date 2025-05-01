import asyncio
import re
import json
import os
import logging
from collections import defaultdict, Counter
from pathlib import Path
import emoji
import numpy as np  # Added for percentile calculation
from datetime import timedelta  # Added for time calculations
from utils import (
    preprocess_messages,
    load_stopwords,
)
from ai_analysis import analyze_messages_with_llm

logger = logging.getLogger(__name__)

STOPWORDS_FILE = "stopwords.txt"

STOPWORDS = set()
try:
    STOPWORDS = load_stopwords()
    logger.info(f"Successfully loaded {len(STOPWORDS)} stopwords from {STOPWORDS_FILE}")

except FileNotFoundError:
    logger.warning(
        f"Stopwords file not found at {STOPWORDS_FILE}. Word counts will include common words."
    )

except Exception as e:
    logger.error(f"Failed to load stopwords from {STOPWORDS_FILE}: {e}", exc_info=True)


async def run_sync(func, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, func, *args)


def calculate_dynamic_convo_break(
    messages_data, default_break_minutes=120, min_break=30, max_break=300
):
    """Calculates a dynamic conversation break time based on response times."""
    response_times_minutes = []
    last_timestamp = None
    last_sender = None

    for timestamp, _, sender, _ in messages_data:
        if last_timestamp and last_sender and sender != last_sender:
            time_diff_seconds = (timestamp - last_timestamp).total_seconds()
            # Only consider plausible response times (e.g., > 5s and < 12 hours)
            if 5 < time_diff_seconds < 12 * 3600:
                response_times_minutes.append(time_diff_seconds / 60)
        last_timestamp = timestamp
        last_sender = sender

    if len(response_times_minutes) < 20:  # Need sufficient data points
        logger.info(
            f"Not enough response time data ({len(response_times_minutes)} points), using default break: {default_break_minutes} mins"
        )
        return default_break_minutes

    try:
        # Use a percentile (e.g., 85th) to find a point separating typical replies from longer gaps
        p85 = np.percentile(response_times_minutes, 85)
        # Set break slightly above this percentile, e.g., p85 * 1.5 or p85 + 30
        dynamic_break = p85 + 30
        # Clamp the value within reasonable bounds
        dynamic_break = max(min_break, min(dynamic_break, max_break))
        logger.info(
            f"Calculated dynamic conversation break: {dynamic_break:.2f} minutes (based on p85={p85:.2f})"
        )
        return round(dynamic_break)
    except Exception as e:
        logger.error(
            f"Error calculating dynamic break: {e}. Falling back to default.",
            exc_info=True,
        )
        return default_break_minutes


async def chat_statistics(messages_data, convo_break_minutes):
    """Calculates various statistics from preprocessed message data."""
    logger.debug(
        f"Calculating statistics for {len(messages_data)} messages using break time: {convo_break_minutes} mins."
    )

    user_message_count = defaultdict(int)
    user_starts_convo = defaultdict(int)
    user_first_texts = Counter()
    word_counter = Counter()
    emoji_counter = Counter()

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
    last_timestamp = None
    last_sender = None
    last_date_str = None
    current_convo_start = True
    all_months = set()
    user_ignored_count = defaultdict(int)

    first_message_timestamp = messages_data[0][0] if messages_data else None
    latest_message_timestamp = messages_data[-1][0] if messages_data else None

    for i, (timestamp, date_obj, sender, filtered_message) in enumerate(messages_data):

        if last_timestamp:
            time_diff_minutes = (timestamp - last_timestamp).total_seconds() / 60
            if time_diff_minutes > convo_break_minutes:
                current_convo_start = True

            if last_sender and sender != last_sender:
                response_diff_seconds = (timestamp - last_timestamp).total_seconds()

                if 0 < response_diff_seconds < 12 * 3600:
                    total_response_time_seconds += response_diff_seconds
                    response_count += 1
                interaction_matrix[last_sender][sender] += 1

        if current_convo_start:
            user_starts_convo[sender] += 1
            current_convo_start = False

        user_message_count[sender] += 1

        current_date_str = timestamp.strftime("%Y-%m-%d")
        if current_date_str != last_date_str:
            user_first_texts[sender] += 1
            last_date_str = current_date_str

        if sender == current_streak_sender:
            current_streak_count += 1
        else:

            if (
                current_streak_sender is not None
                and current_streak_count > max_monologue_count
            ):
                max_monologue_count = current_streak_count
                max_monologue_sender = current_streak_sender

            current_streak_sender = sender
            current_streak_count = 1

        words = re.findall(r"\b\w{3,}\b", filtered_message.lower())
        valid_words = [word for word in words if word not in STOPWORDS]
        word_counter.update(valid_words)

        message_emojis = [char for char in filtered_message if emoji.is_emoji(char)]
        emoji_counter.update(message_emojis)

        daily_message_count_by_date[current_date_str] += 1
        hourly_message_count[timestamp.hour] += 1
        daily_message_count_by_weekday[timestamp.weekday()] += 1

        month_str = timestamp.strftime("%Y-%m")
        monthly_activity_by_user[sender][month_str] += 1
        all_months.add(month_str)

        last_sender = sender
        last_timestamp = timestamp

    if current_streak_sender is not None and current_streak_count > max_monologue_count:
        max_monologue_count = current_streak_count
        max_monologue_sender = current_streak_sender

    if len(messages_data) > 1:
        for i in range(len(messages_data) - 1):
            if messages_data[i][2] == messages_data[i + 1][2]:
                user_ignored_count[messages_data[i][2]] += 1

    average_response_time_minutes = (
        round((total_response_time_seconds / response_count) / 60, 2)
        if response_count > 0
        else 0
    )

    total_messages = sum(user_message_count.values())
    days_active = (
        (latest_message_timestamp.date() - first_message_timestamp.date()).days + 1
        if first_message_timestamp and latest_message_timestamp
        else None
    )

    stats = {
        "total_messages": total_messages,
        "days_active": days_active,
        "user_message_count": dict(user_message_count),
        "most_active_users_pct": {
            user: round((count / total_messages) * 100, 2) if total_messages > 0 else 0
            for user, count in user_message_count.items()
        },
        "conversation_starters_pct": {
            user: (
                round((count / sum(user_starts_convo.values())) * 100, 2)
                if sum(user_starts_convo.values()) > 0
                else 0
            )
            for user, count in user_starts_convo.items()
        },
        "most_ignored_users_pct": {
            user: (
                round((count / sum(user_ignored_count.values())) * 100, 2)
                if sum(user_ignored_count.values()) > 0
                else 0
            )
            for user, count in user_ignored_count.items()
        },
        "first_text_champion": {
            "user": user_first_texts.most_common(1)[0][0] if user_first_texts else None,
            "count": user_first_texts.most_common(1)[0][1] if user_first_texts else 0,
        },
        "longest_monologue": {
            "user": max_monologue_sender,
            "count": max_monologue_count,
        },
        "common_words": dict(word_counter.most_common(10)),
        "common_emojis": {emj: count for emj, count in emoji_counter.most_common(6)},
        "average_response_time_minutes": average_response_time_minutes,
        "peak_hour": (
            hourly_message_count.most_common(1)[0][0] if hourly_message_count else None
        ),
        "user_monthly_activity": get_monthly_activity(
            monthly_activity_by_user, all_months, user_message_count.keys()
        ),
        "weekday_vs_weekend_avg": calc_weekday_weekend_avg(
            daily_message_count_by_weekday
        ),
        "user_interaction_matrix": format_interaction_matrix(
            interaction_matrix, list(user_message_count.keys())
        ),
    }

    logger.debug("Finished calculating statistics.")
    return stats


def get_monthly_activity(monthly_activity_by_user, all_months, all_users_list):
    user_monthly_stats = []
    sorted_months = sorted(list(all_months))
    sorted_users = sorted(list(all_users_list))
    for user in sorted_users:
        user_data = [
            {
                "x": month_str,
                "y": monthly_activity_by_user.get(user, Counter()).get(month_str, 0),
            }
            for month_str in sorted_months
        ]
        user_monthly_stats.append({"id": user, "data": user_data})
    return user_monthly_stats


def calc_weekday_weekend_avg(daily_message_count_by_weekday):
    total_weekday = sum(daily_message_count_by_weekday[day] for day in range(5))
    total_weekend = sum(daily_message_count_by_weekday[day] for day in range(5, 7))
    avg_weekday = round(total_weekday / 5, 2) if total_weekday > 0 else 0
    avg_weekend = round(total_weekend / 2, 2) if total_weekend > 0 else 0
    diff = round(avg_weekday - avg_weekend, 2)
    pct_diff = round((diff / avg_weekday) * 100, 2) if avg_weekday > 0 else 0
    return {
        "average_weekday_messages": avg_weekday,
        "average_weekend_messages": avg_weekend,
        "difference": diff,
        "percentage_difference": pct_diff,
    }


def format_interaction_matrix(interaction_matrix, all_users_list):
    if len(all_users_list) <= 1:
        return None
    sorted_users = sorted(all_users_list)
    matrix_header = [None] + sorted_users
    nivo_matrix = [matrix_header]
    for sender in sorted_users:
        row = [sender] + [
            interaction_matrix[sender].get(target, 0) for target in sorted_users
        ]
        nivo_matrix.append(row)
    return nivo_matrix


async def analyze_chat(chat_file, original_filename=None):
    """
    Asynchronously analyzes WhatsApp chat, preprocesses, calculates stats,
    and optionally calls AI analysis in parallel.
    """
    logger.info(
        f"Starting analysis for chat file: {chat_file} (Original: {original_filename})"
    )

    chat_name = "Unknown Chat"
    try:
        filename = original_filename or os.path.basename(chat_file)
        match = re.match(
            r"WhatsApp Chat with (.+?)(?:\.txt)?$", filename, re.IGNORECASE
        )
        if match:
            chat_name = match.group(1).strip()
    except Exception as e:
        logger.warning(
            f"Could not determine chat name from '{original_filename or chat_file}': {e}"
        )
    logger.info(f"Determined chat name: {chat_name}")

    messages_data = None
    try:
        if (
            "preprocess_messages" not in globals()
            and "preprocess_messages" not in locals()
        ):
            raise NameError(
                "preprocess_messages function not found. Check import from utils."
            )

        logger.debug(
            f"Running synchronous preprocess_messages for {chat_file} in executor."
        )
        messages_data = await run_sync(preprocess_messages, chat_file)

        if not messages_data:
            logger.warning(f"No messages found or extracted from {chat_file}.")
            return {
                "chat_name": chat_name,
                "total_messages": 0,
                "error": "No messages found",
            }

    except FileNotFoundError:
        logger.error(f"Chat file not found: {chat_file}")
        raise
    except Exception as e:
        logger.error(
            f"Error during message preprocessing for {chat_file}: {e}", exc_info=True
        )

        return {
            "chat_name": chat_name,
            "total_messages": 0,
            "error": f"Preprocessing failed: {str(e)}",
        }

    # Calculate dynamic conversation break time *after* preprocessing
    dynamic_convo_break = calculate_dynamic_convo_break(messages_data)

    try:
        unique_users = {msg[2] for msg in messages_data}
        user_count = len(unique_users)
    except Exception as e:
        logger.error(f"Error processing message data to get users: {e}", exc_info=True)
        return {
            "chat_name": chat_name,
            "total_messages": 0,
            "error": f"Data processing error: {str(e)}",
        }

    # Pass the dynamic break time to chat_statistics
    stats_task = asyncio.create_task(
        chat_statistics(messages_data, dynamic_convo_break)
    )
    ai_task = None

    if user_count <= 10:
        logger.info(f"Scheduling AI analysis ({user_count} users <= 10).")

        ai_task = asyncio.create_task(analyze_messages_with_llm(messages_data))
    else:
        logger.info(f"Skipping AI analysis: Too many users ({user_count} > 10).")

    tasks_to_gather = [stats_task]
    if ai_task is not None:
        tasks_to_gather.append(ai_task)

    logger.debug(f"Gathering {len(tasks_to_gather)} tasks...")

    gathered_results = await asyncio.gather(*tasks_to_gather, return_exceptions=True)
    logger.debug("Gather finished.")

    final_results = {"chat_name": chat_name}

    stats_result = gathered_results[0]
    if isinstance(stats_result, Exception):
        logger.error(
            f"Error calculating statistics: {stats_result}", exc_info=stats_result
        )
        final_results["error"] = f"Statistics calculation failed: {str(stats_result)}"
        final_results.update({"total_messages": 0})
    elif isinstance(stats_result, dict):
        try:
            final_results.update(stats_result)
        except TypeError as e:
            logger.error(
                f"TypeError during final_results.update(stats_result): {e}. stats_result type: {type(stats_result)}",
                exc_info=True,
            )
            final_results["error"] = (
                "Internal error: Failed to combine statistics results."
            )
            final_results.setdefault("total_messages", 0)
    else:
        logger.error(
            f"Statistics calculation returned unexpected type: {type(stats_result)}. Value: {str(stats_result)[:200]}"
        )
        final_results["error"] = (
            "Internal error: Statistics calculation returned invalid data."
        )
        final_results.update({"total_messages": 0})

    if ai_task is not None:

        ai_result = gathered_results[1]
        if isinstance(ai_result, Exception):
            logger.error(f"Error during AI analysis: {ai_result}", exc_info=ai_result)
            final_results["ai_analysis"] = {
                "summary": "AI analysis failed.",
                "people": [],
                "error": str(ai_result),
            }
        elif ai_result is None:
            logger.warning(
                "AI analysis function returned None (e.g., API keys failed, no messages for AI)."
            )
            final_results["ai_analysis"] = {
                "summary": "AI analysis could not be completed.",
                "people": [],
            }
        else:
            try:
                if isinstance(ai_result, str):
                    final_results["ai_analysis"] = json.loads(ai_result)
                else:

                    logger.error(
                        f"AI analysis returned unexpected type {type(ai_result)}, expected string."
                    )
                    raise TypeError(
                        f"AI analysis returned non-string: {type(ai_result)}"
                    )

            except json.JSONDecodeError as e:
                logger.error(
                    f"Failed to parse JSON from successful AI analysis: {e}. Content snippet: {str(ai_result)[:100]}...",
                    exc_info=True,
                )
                final_results["ai_analysis"] = {
                    "summary": "AI analysis returned invalid JSON.",
                    "people": [],
                    "error": str(e),
                }
            except TypeError as e:
                logger.error(
                    f"TypeError processing AI result (ai_result type: {type(ai_result)}): {e}",
                    exc_info=True,
                )
                final_results["ai_analysis"] = {
                    "summary": "Internal error processing AI result.",
                    "people": [],
                    "error": str(e),
                }
    else:

        final_results["ai_analysis"] = None

    logger.info(f"Analysis complete for {chat_name}.")

    return final_results
