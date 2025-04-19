import re
from datetime import datetime
import random

# Define patterns and constants
timestamp_pattern = re.compile(r"(\d{2}/\d{2}/\d{2,4}), (\d{2}:\d{2}) - (.*?): (.*)")
system_message_patterns = [
    "Messages and calls are end-to-end encrypted",
    "Disappearing messages were turned",
    "Media omitted",
    "You deleted this message",
    "deleted message",
    "This message edited",
    ".vcf",
    "<",
    ">",
    "}",
    "{"
]
url_pattern = re.compile(r'https?://\S+|www\.\S+')

def remove_emojis_and_links(text):
    # Remove links
    text = url_pattern.sub('', text)

    # Remove emojis using unicode ranges
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags (iOS)
        "\U00002500-\U00002BEF"  # Chinese characters
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "\U0001f926-\U0001f937"
        "\U00010000-\U0010ffff"
        "\u200d"
        "\u2640-\u2642"
        "\u2600-\u2B55"
        "\u23cf"
        "\u23e9"
        "\u231a"
        "\ufe0f"  # dingbats
        "\u3030"
        "]+", flags=re.UNICODE)
    return emoji_pattern.sub(r'', text)

def load_stopwords():
    try:
        with open("stopwords.txt", 'r', encoding='utf-8') as f:
            return set(f.read().splitlines())
    except FileNotFoundError:
        print("Warning: Stopwords file 'stopwords.txt' not found. Using empty stopwords set.")
        return set()

def clean_message(message):
    """Remove URLs, emojis, and strip whitespace."""
    message = remove_emojis_and_links(message)
    return message.strip()

def preprocess_messages(chat_file):
    """Preprocess chat messages."""
    stopwords = load_stopwords()
    messages_data = []
    with open(chat_file, "r", encoding="utf-8") as f:
        for line in f:
            full_match = timestamp_pattern.match(line)
            if not full_match:
                continue
            date, time, sender, message = full_match.groups()
            message = clean_message(message)
            if not message or any(pattern in message for pattern in system_message_patterns):
                continue
            try:
                timestamp = datetime.strptime(f"{date} {time}", "%d/%m/%Y %H:%M")
            except ValueError:
                timestamp = datetime.strptime(f"{date} {time}", "%d/%m/%y %H:%M")
            filtered_message = ' '.join(
                [word for word in message.split()
                 if word.lower() not in stopwords and len(word) > 2]
            )
            messages_data.append((timestamp, date, sender, filtered_message))
    return messages_data

def group_messages_by_topic(data, gap_hours=6):
    """Group messages into topics based on a time gap."""
    topics = []
    current_topic = [data[0]]

    for i in range(1, len(data)):
        prev_time = data[i - 1][0]
        curr_time = data[i][0]
        if (curr_time - prev_time).total_seconds() >= gap_hours * 3600:
            topics.append(current_topic)
            current_topic = []
        current_topic.append(data[i])

    if current_topic:
        topics.append(current_topic)

    return topics

def estimate_tokens(text):
    """Estimate tokens in a message."""
    return int(len(text.split()) * 1.3)  # crude approximation

def stratify_messages(topics):
    """
    For each sender, select up to 10 random messages total, with a combined token count under 1200.
    """
    consolidated_messages = {}

    for topic in topics:
        for msg in topic:
            sender = msg[2]
            message_text = msg[3]

            if not message_text.strip():
                continue
            if len(message_text.split()) < 2:
                continue
            if message_text.isnumeric():
                continue
            if not any(char.isalnum() for char in message_text):
                continue

            if sender not in consolidated_messages:
                consolidated_messages[sender] = []

            consolidated_messages[sender].append(message_text)

    final_sampled = {}

    for sender, msgs in consolidated_messages.items():
        random.shuffle(msgs)
        selected_msgs = []
        total_tokens = 0

        for msg in msgs:
            token_est = estimate_tokens(msg)
            if total_tokens + token_est > 1000:
                continue
            selected_msgs.append(msg)
            total_tokens += token_est
            if len(selected_msgs) == 10:
                break

        final_sampled[sender] = selected_msgs

    return final_sampled
