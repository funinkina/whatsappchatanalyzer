import re
from datetime import datetime
import random
import string
import json

timestamp_pattern = re.compile(
    r"^\u200e?"
    r"\[?"
    r"(\d{1,2}/\d{1,2}/\d{2,4}),\s*"  # Date (Group 1)
    r"(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202f](?:AM|PM))?)"  # Time (Group 2) - Optional seconds, handles space or \u202f before AM/PM
    r"(?:\]?\s*-\s*|\]\s*)"  # Separator: Optional closing bracket + hyphen OR Closing bracket + space
    r"(.*?):\s*(.*)",  # Sender (Group 3), Message (Group 4)
    re.IGNORECASE | re.UNICODE,
)


def load_system_message_patterns():
    """Loads system message patterns from a JSON file."""
    try:
        with open("data/system_message_patterns.json", "r", encoding="utf-8") as f:
            patterns = json.load(f)
            # print(f"Loaded {len(patterns)} system message patterns.")
            return patterns
    except FileNotFoundError:
        print(
            "Error: System message patterns file 'data/system_message_patterns.json' not found."
        )
        return []
    except json.JSONDecodeError:
        print("Error: Could not decode JSON from 'data/system_message_patterns.json'.")
        return []


system_message_patterns = load_system_message_patterns()  # Load patterns from JSON

url_pattern = re.compile(r"https?://\S+|www\.\S+")


def preprocess_messages(chat_file):
    """Parse chat messages, remove links and stopwords."""
    messages_data = []
    # Updated timestamp formats to include seconds
    timestamp_formats = [
        # US style with AM/PM (handles m/d/yy and mm/dd/yyyy)
        "%m/%d/%y %I:%M %p",
        "%m/%d/%Y %I:%M %p",
        "%m/%d/%y %I:%M:%S %p",  # Added seconds
        "%m/%d/%Y %I:%M:%S %p",  # Added seconds
        # European style 24-hour (handles d/m/yy and dd/mm/yyyy)
        "%d/%m/%y %H:%M",
        "%d/%m/%Y %H:%M",
        "%d/%m/%y %H:%M:%S",  # Added seconds
        "%d/%m/%Y %H:%M:%S",  # Added seconds
    ]
    with open(chat_file, "r", encoding="utf-8") as f:
        for line in f:
            full_match = timestamp_pattern.match(line)
            if not full_match:
                if line.startswith("\u200e"):
                    full_match = timestamp_pattern.match(line[1:])
                if not full_match:
                    # print(f"Skipping line (no timestamp match): {line.strip()}")
                    continue

            date_str, time_str, sender, message = full_match.groups()

            if message.startswith("\u200e"):
                message = message[1:]

            if (
                any(pattern in message for pattern in system_message_patterns)
                or "<attached:" in message
            ):
                continue

            timestamp = None
            time_cleaned = time_str.replace("\u202f", " ").strip().upper()
            date_cleaned = date_str.strip()
            datetime_str = f"{date_cleaned} {time_cleaned}"

            for fmt in timestamp_formats:
                try:
                    if "%S" in fmt and time_cleaned.count(":") < 2:
                        continue

                    if "%S" not in fmt and time_cleaned.count(":") >= 2:
                        continue

                    if "%p" in fmt and not (
                        " AM" in datetime_str or " PM" in datetime_str
                    ):
                        continue

                    if "%p" not in fmt and (
                        " AM" in datetime_str or " PM" in datetime_str
                    ):
                        continue

                    timestamp = datetime.strptime(datetime_str, fmt)
                    # print(f"Success: Parsed '{datetime_str}' with format '{fmt}' -> {timestamp}")
                    break
                except ValueError:
                    # print(f"Failed: Parsing '{datetime_str}' with format '{fmt}'")
                    continue

            if timestamp is None:
                # print(f"Warning: Could not parse timestamp from string: '{datetime_str}' in line: {line.strip()}")
                continue

            cleaned_message = clean_text_remove_stopwords(message)
            if cleaned_message:
                messages_data.append((timestamp, date_cleaned, sender, cleaned_message))
    return messages_data


def load_stopwords():
    try:
        with open("data/stopwords.txt", "r", encoding="utf-8") as f:
            stopwords_set = set(f.read().splitlines())
            # print(f"Loaded {len(stopwords_set)} stopwords.")
            return stopwords_set
    except FileNotFoundError:
        print(
            "Warning: Stopwords file 'data/stopwords.txt' not found. Using empty stopwords set."
        )
        return set()


STOPWORDS = {word.lower() for word in load_stopwords()}
if not STOPWORDS:
    print(
        "Warning: Stopwords set is empty. Ensure 'data/stopwords.txt' exists and is populated."
    )


def remove_links(text):
    return url_pattern.sub("", text)


def remove_emojis(text):
    emoji_pattern = re.compile(
        "["
        "\U0001f600-\U0001f64f"  # emoticons
        "\U0001f300-\U0001f5ff"  # symbols & pictographs
        "\U0001f680-\U0001f6ff"  # transport & map symbols
        "\U0001f1e0-\U0001f1ff"  # flags
        "\U00002500-\U00002bef"
        "\U00002702-\U000027b0"
        "\U000024c2-\U0001f251"
        "\U0001f926-\U0001f937"
        "\U00010000-\U0010ffff"
        "\u200d"
        "\u2640-\u2642"
        "\u2600-\u2b55"
        "\u23cf"
        "\u23e9"
        "\u231a"
        "\ufe0f"
        "\u3030"
        "]+",
        flags=re.UNICODE,
    )
    return emoji_pattern.sub("", text)


def clean_text_remove_stopwords(text):
    text = remove_links(text)
    text = text.strip()

    def normalize_word(word):
        return word.strip(string.punctuation).lower()

    filtered_words = [
        w
        for w in map(normalize_word, text.split())
        if w not in STOPWORDS and len(w) > 2
    ]
    return " ".join(filtered_words)


def contains_excessive_special_chars(text, allowed_punctuation=".,?!'\"()"):
    """Checks if a string contains characters other than letters, numbers, whitespace, and allowed punctuation."""
    allowed_chars = set(
        string.ascii_letters + string.digits + string.whitespace + allowed_punctuation
    )
    for char in text:
        if char not in allowed_chars:
            return True
    return False


def group_messages_by_topic(data, gap_hours):
    """Group messages into topics based on time gap, remove emojis."""
    if not data:
        return []

    data.sort(key=lambda x: x[0])

    grouped_topics_raw = []
    if data:
        current_topic_raw = [data[0]]
        for i in range(1, len(data)):
            prev_time = data[i - 1][0]
            curr_time = data[i][0]
            if (curr_time - prev_time).total_seconds() >= gap_hours * 3600:
                grouped_topics_raw.append(current_topic_raw)
                current_topic_raw = []
            current_topic_raw.append(data[i])

        if current_topic_raw:
            grouped_topics_raw.append(current_topic_raw)

    processed_topics = []
    for raw_topic in grouped_topics_raw:
        processed_topic = []
        for timestamp, date_str, sender, cleaned_message in raw_topic:
            emoji_free = remove_emojis(cleaned_message)
            if emoji_free.strip():
                processed_topic.append((timestamp, date_str, sender, emoji_free))
        if processed_topic:
            processed_topics.append(processed_topic)

    return processed_topics


def estimate_tokens(text):
    """Estimate tokens in a message."""
    return int(len(text.split()) * 1.3)


def stratify_messages(topics):
    """
    Groups messages by sender from topics, filters unsuitable messages,
    and samples representative messages, prioritizing longer ones with some randomness.
    """
    consolidated_messages = {}

    for topic in topics:
        for msg in topic:
            sender = msg[2]
            message_text = msg[3]

            if not message_text.strip():
                continue
            if len(message_text.split()) < 3:
                continue
            if message_text.isnumeric():
                continue
            if not any(char.isalnum() for char in message_text):
                continue
            if contains_excessive_special_chars(message_text):
                continue

            if sender not in consolidated_messages:
                consolidated_messages[sender] = []

            consolidated_messages[sender].append(message_text)

    final_sampled = {}
    max_tokens_per_sender = 500
    max_individual_message_length = 600  # Max characters for a single message

    num_senders = len(consolidated_messages)
    if num_senders == 2:
        max_messages_per_sender = 40
    elif num_senders > 6:
        max_messages_per_sender = 15
    else:
        max_messages_per_sender = 25

    for sender, msgs in consolidated_messages.items():
        eligible_msgs = [
            msg for msg in msgs if len(msg) <= max_individual_message_length
        ]

        eligible_msgs.sort(key=len, reverse=True)

        selected_msgs = []
        total_tokens = 0
        potential_indices = list(range(len(eligible_msgs)))
        long_message_priority_prob = 0.7

        while len(selected_msgs) < max_messages_per_sender and potential_indices:
            prioritize_long = random.random() < long_message_priority_prob

            if prioritize_long:
                num_candidates = min(len(potential_indices), 5)
                if num_candidates == 0:
                    break
                chosen_relative_index = random.randrange(num_candidates)

                chosen_msg_index_in_eligible = potential_indices.pop(
                    chosen_relative_index
                )
            else:
                if not potential_indices:
                    break

                random_index_in_potential = random.randrange(len(potential_indices))

                chosen_msg_index_in_eligible = potential_indices.pop(
                    random_index_in_potential
                )

            msg = eligible_msgs[chosen_msg_index_in_eligible]
            token_est = estimate_tokens(msg)

            if total_tokens + token_est <= max_tokens_per_sender:
                selected_msgs.append(msg)
                total_tokens += token_est

        if selected_msgs:
            random.shuffle(selected_msgs)
            final_sampled[sender] = selected_msgs

    return final_sampled
