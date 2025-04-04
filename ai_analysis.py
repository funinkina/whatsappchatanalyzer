import groq
import os
import random
from dotenv import load_dotenv
from main import preprocess_messages
import datetime
import json

data = preprocess_messages(
    chat_file="sample_files/WhatsApp Chat with Mahima.txt",
    stopwords_file="stopwords.txt",
    convo_break_minutes=60,
)

def group_messages_by_topic(data, gap_hours=3):
    # data_sorted = sorted(data, key=lambda x: x[0])
    data_sorted = data
    topics = []
    current_topic = [data_sorted[0]]

    for i in range(1, len(data_sorted)):
        prev_time = data_sorted[i - 1][0]
        curr_time = data_sorted[i][0]
        if (curr_time - prev_time).total_seconds() >= gap_hours * 3600:
            topics.append(current_topic)
            current_topic = []
        current_topic.append(data_sorted[i])

    if current_topic:
        topics.append(current_topic)

    return topics

topics = group_messages_by_topic(data)
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

print(json.dumps(consolidated_messages, indent=2))
