import re
from datetime import datetime
import random
import string

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
            stopwords_set = set(f.read().splitlines())
            print(f"Loaded {len(stopwords_set)} stopwords.")  # Add this line for debug
            return stopwords_set
    except FileNotFoundError:
        print("Warning: Stopwords file 'stopwords.txt' not found. Using empty stopwords set.")
        return set()

# Load stopwords globally
STOPWORDS = {word.lower() for word in load_stopwords()}
if not STOPWORDS:
    print("Warning: Stopwords set is empty. Ensure 'stopwords.txt' exists and is populated.")

def clean_message(message):
    """Remove URLs, emojis, normalize text, remove stopwords, and strip whitespace."""
    message = remove_emojis_and_links(message)
    message = message.strip()

    def normalize_word(word):
        return word.strip(string.punctuation).lower()

    filtered_words = [
        w for w in map(normalize_word, message.split())
        if w not in STOPWORDS and len(w) > 2
    ]

    return ' '.join(filtered_words)

def preprocess_messages(chat_file):
    """Parse chat messages, extract timestamp, sender, and raw message content, filtering system messages."""
    messages_data = []
    with open(chat_file, "r", encoding="utf-8") as f:
        for line in f:
            full_match = timestamp_pattern.match(line)
            if not full_match:
                continue
            date, time, sender, message = full_match.groups()

            # Filter system messages based on raw message content
            if any(pattern in message for pattern in system_message_patterns):
                continue

            try:
                timestamp = datetime.strptime(f"{date} {time}", "%d/%m/%Y %H:%M")
            except ValueError:
                # Handle potential two-digit year format
                timestamp = datetime.strptime(f"{date} {time}", "%d/%m/%y %H:%M")

            messages_data.append((timestamp, date, sender, message))
    return messages_data

def group_messages_by_topic(data, gap_hours=6):
    """Group messages into topics based on a time gap, then clean and filter messages within each topic."""
    if not data:
        return []

    # Load and normalize stopwords
    stopwords = {word.lower() for word in load_stopwords()}
    if not stopwords:
        print("Warning: Stopwords set is empty. Ensure 'stopwords.txt' exists and is populated.")

    grouped_topics_raw = []
    current_topic_raw = [data[0]]

    # First pass: Group raw messages by time gap
    for i in range(1, len(data)):
        prev_time = data[i - 1][0]
        curr_time = data[i][0]
        if (curr_time - prev_time).total_seconds() >= gap_hours * 3600:
            grouped_topics_raw.append(current_topic_raw)
            current_topic_raw = []
        current_topic_raw.append(data[i])

    if current_topic_raw:
        grouped_topics_raw.append(current_topic_raw)

    # Second pass: Clean and filter messages within each grouped topic
    processed_topics = []
    # Inside group_messages_by_topic
    for raw_topic in grouped_topics_raw:
        processed_topic = []
        for timestamp, date, sender, raw_message in raw_topic:
            cleaned_message = clean_message(raw_message)
            if cleaned_message:
                processed_topic.append((timestamp, date, sender, cleaned_message))
        if processed_topic:
            processed_topics.append(processed_topic)


    return processed_topics

def estimate_tokens(text):
    """Estimate tokens in a message."""
    return int(len(text.split()) * 1.3)  # crude approximation

def stratify_messages(topics):
    """
    For each sender, select up to 10 random messages total, with a combined token count under 1000.
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
