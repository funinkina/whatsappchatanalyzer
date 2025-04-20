import re
from datetime import datetime
import random
import string

timestamp_pattern = re.compile(
    r"(\d{1,2}/\d{1,2}/\d{2,4}), "  # Date (Group 1)
    r"(\d{1,2}:\d{2}(?:[\s\u202f](?:AM|PM))?)"  # Time (Group 2) - Handles space or \u202f before AM/PM
    r" - (.*?): (.*)",  # Sender (Group 3), Message (Group 4)
    re.IGNORECASE
)
system_message_patterns = [
    # Encryption & System
    "Messages and calls are end-to-end encrypted",
    "Disappearing messages were turned",
    "changed the subject to",
    "changed this group’s icon",
    "changed this group’s description",
    "changed this group's icon",
    "changed this group's description",
    "You joined using a link",
    "You left",
    "You were added",
    "You removed",

    # Deleted/Edited Messages
    "This message was deleted",
    "You deleted this message",
    "deleted message",
    "This message edited",
    "message deleted",
    "Message deleted",
    "message was deleted",

    # Media/File Omitted
    "Media omitted",
    "Image omitted",
    "Video omitted",
    "Sticker omitted",
    "Document omitted",
    "GIF omitted",
    "Audio omitted",
    "You sent a photo",
    "You sent a voice message",
    "You sent a video",
    "You sent a document",
    "You sent an audio",

    # Calls
    "Missed voice call",
    "Missed video call",
    "You missed a call",
    "Call back",
    "Incoming call",
    "Outgoing call",

    # Contact Cards & Metadata
    ".vcf",
    "Contact card",

    # Formatting artifacts / junk lines
    "<",
    ">",
    "{",
    "}",
    "\u200e",  # Left-to-right mark
    "\u200f",  # Right-to-left mark

    # Extra vague terms to catch junk
    "Group created",
    "Group notification",
    "icon",
    "description"
]
url_pattern = re.compile(r'https?://\S+|www\.\S+')

def preprocess_messages(chat_file):
    """Parse chat messages, remove links and stopwords."""
    messages_data = []
    # Define the possible timestamp formats to try
    # Order matters: try more specific (like AM/PM) before less specific
    timestamp_formats = [
        # US style with AM/PM (handles m/d/yy and mm/dd/yyyy)
        "%m/%d/%y %I:%M %p",
        "%m/%d/%Y %I:%M %p",
        # European style 24-hour (handles d/m/yy and dd/mm/yyyy)
        "%d/%m/%y %H:%M",
        "%d/%m/%Y %H:%M",
    ]
    with open(chat_file, "r", encoding="utf-8") as f:
        for line in f:
            full_match = timestamp_pattern.search(line)
            if not full_match:
                continue
            match_start = full_match.group(0).split(' - ')[0]
            if not line.startswith(match_start):
                continue

            date_str, time_str, sender, message = full_match.groups()

            if any(pattern in message for pattern in system_message_patterns):
                continue

            timestamp = None
            time_cleaned = time_str.replace('\u202f', ' ').strip().upper()
            date_cleaned = date_str.strip()
            datetime_str = f"{date_cleaned} {time_cleaned}"

            for fmt in timestamp_formats:
                try:
                    # Ensure AM/PM formats are only tried if AM/PM is present
                    if "%p" in fmt and not (" AM" in datetime_str or " PM" in datetime_str):
                        continue
                    # Ensure 24hr formats are only tried if AM/PM is NOT present
                    if "%p" not in fmt and (" AM" in datetime_str or " PM" in datetime_str):
                        continue

                    timestamp = datetime.strptime(datetime_str, fmt)
                    # print(f"Success: Parsed '{datetime_str}' with format '{fmt}' -> {timestamp}") # Debug
                    break
                except ValueError:
                    # print(f"Failed: Parsing '{datetime_str}' with format '{fmt}'") # Debug
                    continue

            if timestamp is None:
                print(f"Warning: Could not parse timestamp from string: '{datetime_str}' in line: {line.strip()}")
                continue

            # Clean early: remove links and stopwords
            cleaned_message = clean_text_remove_stopwords(message)
            if cleaned_message:
                # Store original date string along with parsed timestamp for potential reference
                messages_data.append((timestamp, date_cleaned, sender, cleaned_message))
    return messages_data

def load_stopwords():
    try:
        with open("stopwords.txt", 'r', encoding='utf-8') as f:
            stopwords_set = set(f.read().splitlines())
            # print(f"Loaded {len(stopwords_set)} stopwords.") # Debug
            return stopwords_set
    except FileNotFoundError:
        print("Warning: Stopwords file 'stopwords.txt' not found. Using empty stopwords set.")
        return set()

# Load stopwords globally
STOPWORDS = {word.lower() for word in load_stopwords()}
if not STOPWORDS:
    print("Warning: Stopwords set is empty. Ensure 'stopwords.txt' exists and is populated.")

def remove_links(text):
    return url_pattern.sub('', text)

def remove_emojis(text):
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags
        "\U00002500-\U00002BEF"
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
        "\ufe0f"
        "\u3030"
        "]+", flags=re.UNICODE)
    return emoji_pattern.sub('', text)

def clean_text_remove_stopwords(text):
    text = remove_links(text)
    text = text.strip()

    def normalize_word(word):
        return word.strip(string.punctuation).lower()

    filtered_words = [
        w for w in map(normalize_word, text.split())
        if w not in STOPWORDS and len(w) > 2  # Keep slightly longer words
    ]
    return ' '.join(filtered_words)

def group_messages_by_topic(data, gap_hours=6):
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
        # Use the already cleaned message from preprocess_messages
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
    For each sender, select up to 10 random messages total, with a combined token count under 1000.
    """
    consolidated_messages = {}

    for topic in topics:
        # msg format: (timestamp, date_str, sender, emoji_free_message)
        for msg in topic:
            sender = msg[2]
            message_text = msg[3]

            # Basic filtering for message quality
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
    max_tokens_per_sender = 1000
    max_messages_per_sender = 10

    for sender, msgs in consolidated_messages.items():
        random.shuffle(msgs)
        selected_msgs = []
        total_tokens = 0

        for msg in msgs:
            if len(selected_msgs) >= max_messages_per_sender:
                break

            token_est = estimate_tokens(msg)
            if total_tokens + token_est <= max_tokens_per_sender:
                selected_msgs.append(msg)
                total_tokens += token_est
            # Optional: else: consider adding shorter messages even if a longer one was skipped

        if selected_msgs:
            final_sampled[sender] = selected_msgs

    return final_sampled
