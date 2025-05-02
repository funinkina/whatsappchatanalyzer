import asyncio
import re
import json
import os
import logging
import time
import gc
from collections import defaultdict, Counter
import emoji
import numpy as np

from utils import (
    preprocess_messages,
    load_stopwords,
    group_messages_by_topic,
    stratify_messages,
)
from ai_analysis import analyze_messages_with_llm

logger = logging.getLogger(__name__)


STOPWORDS = set()
try:
    STOPWORDS = load_stopwords()
    logger.info(f"Successfully loaded {len(STOPWORDS)}")
except FileNotFoundError:
    logger.warning(
        "Stopwords file not found Word counts will include common words. Continuing without stopwords."
    )

except Exception as e:
    logger.error(
        f"Failed to load stopwords: {e}. Continuing without stopwords.",
        exc_info=True,
    )


async def run_sync_in_executor(func, *args):
    """Runs a blocking synchronous function in FastAPI's default thread pool."""
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

            if 5 < time_diff_seconds < (12 * 3600):
                response_times_minutes.append(time_diff_seconds / 60)
        last_timestamp = timestamp
        last_sender = sender

    if len(response_times_minutes) < 20:
        logger.info(
            f"Not enough response time data ({len(response_times_minutes)} points) for dynamic break, using default: {default_break_minutes} mins"
        )
        return default_break_minutes

    try:

        p85 = np.percentile(response_times_minutes, 85)

        dynamic_break = p85 + 30

        dynamic_break = max(min_break, min(dynamic_break, max_break))
        logger.info(
            f"Calculated dynamic conversation break: {dynamic_break:.2f} minutes (based on p85={p85:.2f})"
        )
        return round(dynamic_break)
    except Exception as e:
        logger.error(
            f"Error calculating dynamic break: {e}. Falling back to default {default_break_minutes}.",
            exc_info=True,
        )
        return default_break_minutes


async def chat_statistics(messages_data, convo_break_minutes):
    """
    Calculates various statistics from preprocessed message data.
    Optimized for a single pass where possible.
    """
    start_time = time.monotonic()
    logger.debug(
        f"Starting statistics calculation for {len(messages_data)} messages..."
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
    current_convo_start_sender = None
    all_months = set()
    user_ignored_count = defaultdict(int)

    first_message_timestamp = messages_data[0][0] if messages_data else None
    latest_message_timestamp = messages_data[-1][0] if messages_data else None

    for i, (timestamp, date_obj, sender, filtered_message) in enumerate(messages_data):

        is_new_convo = False
        if last_timestamp:
            time_diff_minutes = (timestamp - last_timestamp).total_seconds() / 60
            if time_diff_minutes > convo_break_minutes:
                is_new_convo = True
                current_convo_start_sender = sender

            elif last_sender and sender != last_sender:
                response_diff_seconds = (timestamp - last_timestamp).total_seconds()

                if 5 < response_diff_seconds < (12 * 3600):
                    total_response_time_seconds += response_diff_seconds
                    response_count += 1
                interaction_matrix[last_sender][sender] += 1
        else:

            is_new_convo = True
            current_convo_start_sender = sender

        if is_new_convo and current_convo_start_sender:
            user_starts_convo[current_convo_start_sender] += 1
            current_convo_start_sender = None

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
        if STOPWORDS:
            valid_words = [word for word in words if word not in STOPWORDS]
            word_counter.update(valid_words)
        else:
            word_counter.update(words)

        message_emojis = emoji.distinct_emoji_list(filtered_message)
        if message_emojis:
            emoji_counter.update(message_emojis)

        daily_message_count_by_date[current_date_str] += 1
        hourly_message_count[timestamp.hour] += 1
        daily_message_count_by_weekday[timestamp.weekday()] += 1

        month_str = timestamp.strftime("%Y-%m")
        monthly_activity_by_user[sender][month_str] += 1
        all_months.add(month_str)

        if i + 1 < len(messages_data) and messages_data[i + 1][2] == sender:
            user_ignored_count[sender] += 1

        last_sender = sender
        last_timestamp = timestamp

    if current_streak_sender is not None and current_streak_count > max_monologue_count:
        max_monologue_count = current_streak_count
        max_monologue_sender = current_streak_sender

    average_response_time_minutes = (
        round((total_response_time_seconds / response_count) / 60, 2)
        if response_count > 0
        else 0
    )

    total_messages = sum(user_message_count.values())
    total_starts = sum(user_starts_convo.values())
    total_ignored = sum(user_ignored_count.values())

    days_active = (
        (latest_message_timestamp.date() - first_message_timestamp.date()).days + 1
        if first_message_timestamp and latest_message_timestamp
        else 0
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
            user: round((count / total_starts) * 100, 2) if total_starts > 0 else 0
            for user, count in user_starts_convo.items()
        },
        "most_ignored_users_pct": {
            user: round((count / total_ignored) * 100, 2) if total_ignored > 0 else 0
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
        "common_emojis": dict(emoji_counter.most_common(6)),
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

    end_time = time.monotonic()
    logger.debug(
        f"Statistics calculation finished in {end_time - start_time:.4f} seconds."
    )
    return stats


def get_monthly_activity(monthly_activity_by_user, all_months, all_users_list):
    """Formats monthly activity for Nivo charts."""
    if not all_months or not all_users_list:
        return []
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
    """Calculates average messages on weekdays vs weekends."""

    total_weekday = sum(daily_message_count_by_weekday.get(day, 0) for day in range(5))
    total_weekend = sum(
        daily_message_count_by_weekday.get(day, 0) for day in range(5, 7)
    )

    avg_weekday = round(total_weekday / 5, 2)
    avg_weekend = round(total_weekend / 2, 2)
    diff = round(avg_weekday - avg_weekend, 2)
    pct_diff = round((diff / avg_weekday) * 100, 2) if avg_weekday > 0 else 0
    return {
        "average_weekday_messages": avg_weekday,
        "average_weekend_messages": avg_weekend,
        "difference": diff,
        "percentage_difference": pct_diff,
    }


# In main_analysis.py


def format_interaction_matrix(interaction_matrix, all_users_list):
    """
    Formats interaction matrix as a list of lists for frontend compatibility.
    The first row contains headers [None, UserA, UserB, ...].
    Subsequent rows are [Sender, Count_to_UserA, Count_to_UserB, ...].
    Returns None if there are 1 or fewer users.
    """
    if len(all_users_list) <= 1:
        return None

    sorted_users = sorted(list(all_users_list))

    # Create the header row: [None, 'UserA', 'UserB', ...]
    matrix_header = [None] + sorted_users
    # Initialize the matrix with the header row
    list_of_lists_matrix = [matrix_header]

    # Create data rows: ['SenderA', 0, 5, ...]
    for sender in sorted_users:
        # Start the row with the sender's name
        row = [sender]
        # Append the interaction counts for this sender to each target user
        counts = [
            interaction_matrix.get(sender, defaultdict(int)).get(target, 0)
            for target in sorted_users
        ]
        row.extend(counts)
        list_of_lists_matrix.append(row)

    return list_of_lists_matrix


async def analyze_chat(chat_file, original_filename=None):
    """
    Asynchronously analyzes WhatsApp chat, preprocesses, calculates stats,
    and optionally calls AI analysis in parallel, with memory optimization.
    """
    overall_start_time = time.monotonic()
    log_prefix = f"[{original_filename or os.path.basename(chat_file)}]"
    logger.info(f"Starting analysis for chat file: {original_filename or chat_file}")

    messages_data = None
    message_count = 0
    preprocess_time = 0
    stats_time = 0
    ai_prep_time = 0
    ai_api_time = 0
    gather_time = 0

    try:

        preprocess_start = time.monotonic()
        messages_data = await run_sync_in_executor(preprocess_messages, chat_file)
        preprocess_time = time.monotonic() - preprocess_start

        if messages_data:
            message_count = len(messages_data)
            logger.info(
                f"{log_prefix} Preprocessing finished in {preprocess_time:.4f}s. Found {message_count} messages."
            )
        else:

            message_count = 0
            logger.warning(
                f"{log_prefix} Preprocessing finished in {preprocess_time:.4f}s but found no messages."
            )

            return {
                "chat_name": original_filename or "Unknown Chat",
                "total_messages": 0,
                "error": "No messages found in the file after preprocessing.",
                "ai_analysis": None,
            }

        unique_users = sorted(list({msg[2] for msg in messages_data}))
        user_count = len(unique_users)
        chat_name = f"{user_count} User Chat"
        if user_count == 1:
            chat_name = f"Notes ({unique_users[0]})"
        elif user_count == 2:
            chat_name = f"{unique_users[0]} & {unique_users[1]}"
        elif user_count > 2:

            chat_name = (
                f"{unique_users[0]}, {unique_users[1]} & {user_count - 2} others"
            )

        convo_break_start = time.monotonic()
        dynamic_convo_break = calculate_dynamic_convo_break(messages_data)
        convo_break_time = time.monotonic() - convo_break_start
        logger.debug(
            f"{log_prefix} Dynamic convo break calculated ({dynamic_convo_break} mins) in {convo_break_time:.4f}s"
        )

        logger.debug(f"{log_prefix} Creating analysis tasks...")

        stats_task = asyncio.create_task(
            chat_statistics(messages_data, dynamic_convo_break),
            name=f"StatsTask-{original_filename}",
        )

        ai_task = None

        if 1 < user_count <= 10:
            logger.info(f"{log_prefix} Scheduling AI analysis for {user_count} users.")
            ai_prep_start = time.monotonic()

            ai_task = asyncio.create_task(
                analyze_messages_with_llm(messages_data),
                name=f"AITask-{original_filename}",
            )
            ai_prep_time = time.monotonic() - ai_prep_start
            logger.debug(f"{log_prefix} AI task created in {ai_prep_time:.4f}s.")
        elif user_count <= 1:
            logger.info(f"{log_prefix} Skipping AI analysis: Only 1 user.")
        else:
            logger.info(
                f"{log_prefix} Skipping AI analysis: User count ({user_count}) > 10."
            )

        logger.debug(
            f"{log_prefix} Releasing reference to messages_data list and suggesting GC."
        )
        messages_data = None
        collected = gc.collect()
        logger.debug(
            f"{log_prefix} Garbage collection suggested, collected {collected} objects."
        )

        tasks_to_gather = [stats_task]
        if ai_task:
            tasks_to_gather.append(ai_task)

        logger.debug(f"{log_prefix} Gathering {len(tasks_to_gather)} tasks...")
        gather_start = time.monotonic()

        gathered_results = await asyncio.gather(
            *tasks_to_gather, return_exceptions=True
        )
        gather_time = time.monotonic() - gather_start
        logger.info(f"{log_prefix} Tasks gathered in {gather_time:.4f}s.")

        final_results = {"chat_name": chat_name}
        task_error_occurred = False

        stats_result = gathered_results[0]
        if isinstance(stats_result, Exception):
            logger.error(
                f"{log_prefix} Statistics task failed: {stats_result}",
                exc_info=stats_result,
            )
            final_results["error"] = (
                f"Statistics calculation failed: {type(stats_result).__name__}"
            )
            final_results["stats"] = None

            final_results["total_messages"] = message_count
            task_error_occurred = True
        elif isinstance(stats_result, dict):
            stats_time = time.monotonic()
            final_results.update(stats_result)
            logger.debug(f"{log_prefix} Statistics processing successful.")

            if "total_messages" not in final_results:
                logger.warning(
                    f"{log_prefix} 'total_messages' missing from stats dict, using stored count."
                )
                final_results["total_messages"] = message_count
        else:
            logger.error(
                f"{log_prefix} Statistics task returned unexpected type: {type(stats_result)}"
            )
            final_results["error"] = "Internal error: Invalid statistics data."
            final_results["stats"] = None

            final_results["total_messages"] = message_count
            task_error_occurred = True

        if ai_task:
            ai_result = gathered_results[1]
            ai_api_time = time.monotonic()
            if isinstance(ai_result, Exception):
                logger.error(
                    f"{log_prefix} AI analysis task failed: {ai_result}",
                    exc_info=ai_result,
                )
                final_results["ai_analysis"] = {
                    "summary": "AI analysis failed.",
                    "people": [],
                    "error": str(ai_result),
                }
                task_error_occurred = True
            elif ai_result is None:
                logger.warning(
                    f"{log_prefix} AI analysis task returned None (e.g., skipped due to keys/API issues)."
                )
                final_results["ai_analysis"] = None
            else:

                try:
                    if isinstance(ai_result, str):
                        ai_data = json.loads(ai_result)
                    elif isinstance(ai_result, dict):
                        ai_data = ai_result
                    else:
                        raise TypeError(
                            f"AI task returned unexpected type: {type(ai_result)}"
                        )
                    final_results["ai_analysis"] = ai_data
                    logger.debug(f"{log_prefix} AI analysis processing successful.")
                except (json.JSONDecodeError, TypeError) as ai_proc_err:
                    logger.error(
                        f"{log_prefix} Failed to process AI analysis result: {ai_proc_err}",
                        exc_info=True,
                    )
                    final_results["ai_analysis"] = {
                        "summary": "AI analysis failed (result processing error).",
                        "people": [],
                        "error": str(ai_proc_err),
                    }
                    task_error_occurred = True
        else:

            final_results["ai_analysis"] = None

    except FileNotFoundError:
        logger.error(f"{log_prefix} Chat file not found: {chat_file}")
        raise
    except Exception as e:
        logger.error(
            f"{log_prefix} Unexpected error during main analysis workflow: {e}",
            exc_info=True,
        )

        return {
            "chat_name": original_filename or "Unknown Chat",
            "total_messages": message_count,
            "error": f"Core analysis failed unexpectedly: {type(e).__name__}",
            "ai_analysis": None,
        }

    finally:

        overall_time = time.monotonic() - overall_start_time
        logger.info(
            f"{log_prefix} Analysis complete in {overall_time:.4f}s. "
            f"[Preproc: {preprocess_time:.4f}s | Stats: {stats_time - (gather_start if stats_time else 0):.4f}s (approx) | "
            f"AI Prep: {ai_prep_time:.4f}s | AI API: {ai_api_time - (gather_start if ai_api_time else 0):.4f}s (approx) | "
            f"Gather: {gather_time:.4f}s]"
        )

    if task_error_occurred:
        logger.warning(f"{log_prefix} Analysis completed with errors in sub-tasks.")
    else:
        logger.info(f"{log_prefix} Analysis completed successfully.")

    return final_results
