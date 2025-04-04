from groq import AsyncGroq
import random
import os
import asyncio
from dotenv import load_dotenv
from utils import preprocess_messages
import json

load_dotenv()

def group_messages_by_topic(data, gap_hours=3):
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

async def analyze_messages_with_llm(data, gap_hours=3):
    """
    Analyze messages using Groq API by grouping and stratifying them first.

    Args:
        data: List of messages to analyze
        gap_hours: Time gap in hours to group messages into topics

    Returns:
        Structured analysis from the Groq API
    """
    # Group messages by topic
    topics = group_messages_by_topic(data, gap_hours)

    # Stratify messages
    consolidated_messages = stratify_messages(topics)
    consolidated_messages_json = json.dumps(consolidated_messages, indent=2)

    # Use Groq API to analyze the messages
    groq_api_key = os.getenv("GROQ_API_KEY")

    if not groq_api_key:
        print("Error: GROQ_API_KEY not found in environment variables")
        return None

    client = AsyncGroq(api_key=groq_api_key)

    system_prompt = """
        You will be given messages exchanged between different people in a WhatsApp chat:

        Please analyze these messages and provide insights on:
        1. The overall sentiment of conversations
        2. Prominent topics or themes discussed
        3. Communication patterns between participants
        4. Any interesting observations about the conversation dynamics

        Format your response as a structured analysis.
        """

    try:
        response = await client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": consolidated_messages_json}
            ],
            temperature=0.5,
            max_tokens=1024
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Error connecting to Groq API: {e}")
        return None

if __name__ == "__main__":
    data = preprocess_messages(
        chat_file="sample_files/WhatsApp Chat with Mahima.txt",
        stopwords_file="stopwords.txt",
    )

    analysis_result = asyncio.run(analyze_messages_with_llm(data))

    # Display the analysis
    print("\n=== GROQ ANALYSIS ===")
    print(analysis_result)
