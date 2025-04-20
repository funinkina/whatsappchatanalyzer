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
    # Group and stratify messages before sending them to the LLM
    topics = group_messages_by_topic(data, gap_hours)
    grouped_messages_json = json.dumps(stratify_messages(topics), indent=2)

    # Fetch API key from environment
    groq_api_key = os.getenv("GROQ_API_KEY")

    if not groq_api_key:
        print("Error: GROQ_API_KEY not found in environment variables")
        return None

    # Create client with Groq API key
    client = AsyncGroq(api_key=groq_api_key)

    # Define system message prompt
    system_prompt = """
    Youll get a chat. give the user two things:
    1. fun summary or relationship insight in 5 lines.
    (you have small context, dont mention actual words from chats, but the broader generalized feel)
    format: "Summary: "
    2. For each person:
    - assign one animal from: lion (commander), wolf (clever), dog (obidient), cat(cute), elephant(strong calm), monkey(mischievous), 
    rabbit(always on the go), bear(big strong), sheep (calm)— based on their personality and why in 1 quick line.
    don't choose same animal for two people. can choose any of the given animal.
    format: 'person: username: username is the lion of the group, always leading the pack!'
    (write 'person: ' before username of each person)
    - Then write 2 simple, fun lines describing what theyre like.
    Keep it genz, quirky, playful, and easy — nothing fancy!
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
