import groq
import os
import random
from dotenv import load_dotenv
from main import preprocess_messages
import datetime
data = preprocess_messages(
    chat_file="sample_files/WhatsApp Chat with Prachi Sharma.txt",
    stopwords_file="stopwords.txt",
    convo_break_minutes=60,
)
def group_messages_by_topic(data, gap_hours=3):
    data_sorted = sorted(data, key=lambda x: x[0])
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
for idx, topic in enumerate(topics, start=1):
    unique_senders = {}
    for msg in topic:
        sender = msg[2]
        if sender not in unique_senders:
            unique_senders[sender] = []
        unique_senders[sender].append(msg)

    distinct_senders = list(unique_senders.keys())
    random.shuffle(distinct_senders)
    selected = []
    for sender in distinct_senders[:3]:
        selected.append(random.choice(unique_senders[sender]))

    print(f"Topic {idx}: {selected}\n")
    # Here you can pass 'selected' to an LLM for analysis

# print(data)
