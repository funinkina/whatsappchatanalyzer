from groq import AsyncGroq
import os
import asyncio
from dotenv import load_dotenv
from utils import preprocess_messages, group_messages_by_topic, stratify_messages
import json

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
    topics = group_messages_by_topic(data, gap_hours)
    grouped_messages_json = json.dumps(stratify_messages(topics), indent=2)

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
                {"role": "user", "content": grouped_messages_json}
            ],
            temperature=0.9,
            max_tokens=1024
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Error connecting to Groq API: {e}")
        return None

if __name__ == "__main__":
    data = preprocess_messages(chat_file="sample_files/WhatsApp Chat with Mahima.txt")
    analysis_result = asyncio.run(analyze_messages_with_llm(data))
    print(analysis_result)
