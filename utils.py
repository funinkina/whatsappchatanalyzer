import re
from datetime import datetime

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

def load_stopwords(file_path="stopwords.txt"):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return set(f.read().splitlines())
    except FileNotFoundError:
        print(f"Warning: Stopwords file '{file_path}' not found. Using empty stopwords set.")
        return set()

def clean_message(message):
    """Remove URLs and strip whitespace."""
    message = url_pattern.sub('', message)
    return message.strip()

def preprocess_messages(chat_file, stopwords_file='stopwords.txt'):
    """Preprocess chat messages."""
    stopwords = load_stopwords(stopwords_file)
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
