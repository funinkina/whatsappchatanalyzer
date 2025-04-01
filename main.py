import re
from collections import defaultdict, Counter
from datetime import datetime
import emoji

message_pattern = re.compile(r"\d{2}/\d{2}/\d{2,4}, \d{2}:\d{2} - (.*?): (.*)")
timestamp_pattern = re.compile(r"(\d{2}/\d{2}/\d{2,4}), (\d{2}:\d{2}) - (.*?): (.*)")

# Ignore system messages
system_message_patterns = [
    "Messages and calls are end-to-end encrypted",
    "Disappearing messages were turned",
    "Media omitted",
    "You deleted this message",
    "deleted message",
    "This message edited",
    "<",
    ">",
    "}",
    "{"
]

def load_stopwords(file_path="stopwords.txt"):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return set(f.read().splitlines())
    except FileNotFoundError:
        print(f"Warning: Stopwords file '{file_path}' not found. Using empty stopwords set.")
        return set()

# URL pattern to filter out links
url_pattern = re.compile(r'https?://\S+|www\.\S+')

def clean_message(message):
    # Remove URLs
    message = url_pattern.sub('', message)
    return message.strip()

def analyze_chat(chat_file, convo_break_minutes=60, stopwords_file="stopwords.txt"):
    """
    Analyze WhatsApp chat and return statistics

    Args:
        chat_file (str): Path to the chat file
        convo_break_minutes (int): Minutes of inactivity to consider a new conversation
        stopwords_file (str): Path to stopwords file

    Returns:
        dict: Chat analysis results
    """
    stopwords = load_stopwords(stopwords_file)

    user_message_count = defaultdict(int)
    user_starts_convo = defaultdict(int)
    user_ignored_count = defaultdict(int)
    user_first_texts = Counter()
    word_counter = Counter()
    emoji_counter = Counter()
    user_messages = defaultdict(list)  # New: Store messages by user

    CONVO_BREAK_MINUTES = convo_break_minutes
    last_timestamp = None
    last_sender = None
    user_last_message = {}
    last_date = None
    current_convo_start = True

    with open(chat_file, "r", encoding="utf-8") as f:
        for line in f:
            full_match = timestamp_pattern.match(line)
            if not full_match:
                continue

            date, time, sender, message = full_match.groups()

            message = clean_message(message)
            # Changed: Check if any system message pattern is contained in the message
            if not message or any(pattern in message for pattern in system_message_patterns):
                continue

            try:
                timestamp = datetime.strptime(f"{date} {time}", "%d/%m/%Y %H:%M")
            except ValueError:
                timestamp = datetime.strptime(f"{date} {time}", "%d/%m/%y %H:%M")

            is_new_convo = False
            if last_timestamp:
                time_diff = (timestamp - last_timestamp).total_seconds() / 60
                if time_diff > CONVO_BREAK_MINUTES:
                    is_new_convo = True
                    current_convo_start = True
            else:
                # First message in the chat starts a conversation
                is_new_convo = True

            # Count conversation starts
            if current_convo_start:
                user_starts_convo[sender] += 1
                current_convo_start = False

            # Count messages per user
            user_message_count[sender] += 1

            # Store cleaned message for this user
            # Remove stopwords from the message
            words = message.split()
            filtered_message = ' '.join([word for word in words
                                        if word.lower() not in stopwords])
            user_messages[sender].append(filtered_message)

            # Track first text of the day
            if date != last_date:
                user_first_texts[sender] += 1
                last_date = date

            # Count words (excluding stopwords)
            words = re.findall(r'\b\w+\b', message.lower())
            filtered_words = [word for word in words if word not in stopwords]
            word_counter.update(filtered_words)

            # Count emojis
            message_emojis = [char for char in message if char in emoji.EMOJI_DATA]
            emoji_counter.update(message_emojis)

            # Detect ignored messages
            if last_sender and last_sender != sender:
                user_last_message[last_sender] = sender
            elif last_sender and last_sender not in user_last_message:
                user_ignored_count[last_sender] += 1

            # Update last sender and timestamp
            last_sender = sender
            last_timestamp = timestamp

    # Convert counts to percentages
    total_messages = sum(user_message_count.values())
    most_active_users = {user: round((count / total_messages) * 100, 2) for user, count in user_message_count.items()}
    conversation_starters = {user: round((count / sum(user_starts_convo.values())) * 100, 2) if sum(user_starts_convo.values()) > 0 else 0 for user, count in user_starts_convo.items()}
    most_ignored_users = {user: round((count / sum(user_ignored_count.values())) * 100, 2) if sum(user_ignored_count.values()) > 0 else 0 for user, count in user_ignored_count.items()}

    # Get the user who texts first most often
    most_first_texter = user_first_texts.most_common(1)[0][0] if user_first_texts else "N/A"
    first_text_percentage = round((user_first_texts[most_first_texter] / sum(user_first_texts.values())) * 100, 2) if sum(user_first_texts.values()) > 0 else 0

    # Format results as dictionary suitable for API response
    results = {
        "most_active_users": dict(sorted(most_active_users.items(), key=lambda x: x[1], reverse=True)),
        "conversation_starters": dict(sorted(conversation_starters.items(), key=lambda x: x[1], reverse=True)),
        "most_ignored_users": dict(sorted(most_ignored_users.items(), key=lambda x: x[1], reverse=True)),
        "first_text_champion": {
            "user": most_first_texter,
            "percentage": first_text_percentage
        },
        "common_words": dict(word_counter.most_common(10)),
        "common_emojis": {emoji_char: count for emoji_char, count in emoji_counter.most_common(10)},
        # "user_messages": user_messages  # Add the messages by user to the results
    }

    return results

if __name__ == "__main__":
    # Default chat file path
    chat_file = "sample_files/WhatsApp Chat with Aayush Jain GDSC.txt"

    # Run the analysis
    results = analyze_chat(chat_file)

    # Display results in user-friendly format
    print("\n🔥 Most Active Users (% of total messages):")
    for user, percentage in sorted(results["most_active_users"].items(), key=lambda x: x[1], reverse=True):
        print(f"{user}: {percentage}%")

    print("\n💬 Users Who Start Conversations Most (% of convos started):")
    for user, percentage in sorted(results["conversation_starters"].items(), key=lambda x: x[1], reverse=True):
        print(f"{user}: {percentage}%")

    print("\n👻 Most Ignored Users (% of ignored messages):")
    for user, percentage in sorted(results["most_ignored_users"].items(), key=lambda x: x[1], reverse=True):
        print(f"{user}: {percentage}%")

    print("\n🌅 User Who Texts First Most Often:")
    first_texter = results["first_text_champion"]
    print(f"{first_texter['user']}: {first_texter['percentage']}% of first texts")

    print("\n📝 Most Common Words:")
    for word, count in results["common_words"].items():
        print(f"{word}: {count}")

    print("\n😊 Most Used Emojis:")
    for emoji_char, count in results["common_emojis"].items():
        print(f"{emoji_char}: {count}")

    # Display a sample of messages for each user
    # print(results["user_messages"]['Aayush Jain GDSC'])
    # print(len(results["user_messages"]['Aryan Kushwaha']))
