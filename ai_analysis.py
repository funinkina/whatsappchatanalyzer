from groq import AsyncGroq
import os
import asyncio
from dotenv import load_dotenv
from utils import preprocess_messages, group_messages_by_topic, stratify_messages
import json
from collections import Counter

load_dotenv()

async def analyze_messages_with_llm(data, gap_hours=3):
    """
    Analyze messages using Groq API by grouping and stratifying them first.

    Args:
        data: List of messages to analyze
        gap_hours: Time gap in hours to group messages into topics

    Returns:
        Structured analysis from the Groq API
    """
    # Group and stratify messages before sending them to the LLM
    topics = group_messages_by_topic(data, gap_hours)
    grouped_messages_json = json.dumps(stratify_messages(topics), indent=2)

    # Count unique users to determine prompt
    unique_users = Counter([message[2] for message in data]).keys()
    user_count = len(unique_users)

    # Fetch API key from environment
    groq_api_key = os.getenv("GROQ_API_KEY")

    if not groq_api_key:
        print("Error: GROQ_API_KEY not found in environment variables")
        return None

    # Create client with Groq API key
    client = AsyncGroq(api_key=groq_api_key)

    # Define system message prompt based on user count
    system_prompt = """
    You'll get a chat. Give the user two things in JSON format:
    Return strictly as JSON, no extra text.
    1. A summary of the chat, including:
    - The main topics discussed
    - The overall vibe of the chat
    - Any notable events or highlights
    *STRICTLY RETURN CORRECT JSON ONLY, NOTHING ELSE*

    {
    "summary": "<Give a fun summary or relationship insight — don't use actual words from chat, just generalized vibes and the kind of relationship they have>",
    """

    # Only include animal assignments for 10 or fewer users
    if user_count <= 10:
        system_prompt += """
        "people": [
        {
        "name": "<person name>",
        "animal": "one of: <owl, lion, dolphin, fox, bear, rabbit, monkey, tiger, wolf, eagle, elephant, penguin, cat, dog, koala, panda, sheep> — each assigned uniquely strcitly from this list.",
        "description": "<person: name is the ANIMAL of the group/duo, with 1 quick reason! Then add 2 fun lines about their vibe, keep it Gen Z, playful, and simple.>"
        },
        ...
        ]
        }

        Rules:
        - Don't repeat animals.
        - Format each person block like example:
        {
        "name": "Rajesh",
        "animal": "monkey",
        "description": "Rajesh is the monkey of the group, always jumping from one topic to another with mischievous energy! Rajesh is like a burst of sunshine, always bringing a playful twist to the conversation, and never failing to make you smile."
        }
        """
    else:
        system_prompt += """
    }

    Rules:
    - Only provide a summary since there are more than 10 users in this chat.
    - No need to include animal assignments or individual descriptions.
    """

    try:
        response = await client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": grouped_messages_json}
            ],
            temperature=0.9,
            max_tokens=1024
        )

        if response and response.choices:
            return response.choices[0].message.content
        else:
            print("No valid choices returned from Groq.")
            return "No valid analysis from AI."

    except Exception as e:
        print(f"Error connecting to Groq API: {e}")
        return None

if __name__ == "__main__":
    data = preprocess_messages(chat_file="sample_files/chat.txt")
    if data:
        analysis_result = asyncio.run(analyze_messages_with_llm(data))
        print(analysis_result)
    else:
        print("Failed to preprocess messages.")
