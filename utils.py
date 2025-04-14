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

def load_stopwords():
    try:
        with open("stopwords.txt", 'r', encoding='utf-8') as f:
            return set(f.read().splitlines())
    except FileNotFoundError:
        print("Warning: Stopwords file 'stopwords.txt' not found. Using empty stopwords set.")
        return set()

def clean_message(message):
    """Remove URLs and strip whitespace."""
    message = url_pattern.sub('', message)
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

def group_messages_by_topic(data, gap_hours=3):
    """
    Group messages into topics based on a time gap.

    Args:
        data: List of messages
        gap_hours: Time gap in hours to separate topics

    Returns:
        List of grouped topics
    """
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

def stratify_messages(topics):
    """
    Stratify messages by selecting a random message from each sender within each topic.

    Args:
        topics: List of topics, where each topic is a list of messages

    Returns:
        Dictionary mapping senders to their selected messages
    """
    consolidated_messages = {}
    for idx, topic in enumerate(topics, start=1):
        if len(topic) < 2:
            continue
        unique_senders = {}
        for msg in topic:
            if not msg[3].strip():
                continue
            if len(msg[3].split()) < 2:
                continue
            if msg[3].isnumeric():
                continue
            if not any(char.isalnum() for char in msg[3]):
                continue
            sender = msg[2]
            if sender not in unique_senders:
                unique_senders[sender] = []
            unique_senders[sender].append(msg)

        distinct_senders = list(unique_senders.keys())
        random.shuffle(distinct_senders)
        sampled_messages = []
        for sender in distinct_senders[:5]:
            sampled_messages.append(random.choice(unique_senders[sender]))

        for msg in sampled_messages:
            sender = msg[2]
            if sender not in consolidated_messages:
                consolidated_messages[sender] = []
            consolidated_messages[sender].append(msg[3])

    return consolidated_messages
