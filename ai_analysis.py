from groq import AsyncGroq
import os
from dotenv import load_dotenv
from utils import group_messages_by_topic, stratify_messages
import json
from collections import Counter

load_dotenv()

async def analyze_messages_with_llm(data, gap_hours=6):
    """
    Analyze messages using Groq API by grouping and stratifying them first.

    Args:
        data: List of messages to analyze
        gap_hours: Time gap in hours to group messages into topics

    Returns:
        Structured analysis from the Groq API
    """
    topics = group_messages_by_topic(data, gap_hours)
    stratified_topics = stratify_messages(topics)
    grouped_messages_json = json.dumps(stratified_topics, indent=2)
    with open("grouped_messages.json", "w") as f:
        f.write(grouped_messages_json)
    if not grouped_messages_json:
        print("Error: No messages to analyze")
        return None

    unique_users = Counter([message[2] for message in data]).keys()
    user_count = len(unique_users)

    groq_api_key1 = os.getenv("GROQ_API_KEY1")
    groq_api_key2 = os.getenv("GROQ_API_KEY2")
    groq_api_key3 = os.getenv("GROQ_API_KEY3")

    api_keys = [groq_api_key1, groq_api_key2, groq_api_key3]

    if not api_keys:
        print("Error: No GROQ_API_KEY found in environment variables")
        return None

    async def invoke_groq_api(api_key):
        if not api_key:
            return None, "API key not provided"
        try:
            client = AsyncGroq(api_key=api_key)
            response = await client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": grouped_messages_json}
                ],
                temperature=1.2,
                max_tokens=1024
            )
            if response and response.choices:
                return response.choices[0].message.content, None
            else:
                return None, "No valid choices returned from Groq."
        except Exception as e:
            return None, f"Error connecting to Groq API: {e}"

    system_prompt = """
    You are a Gen Z teenager judging a group chat. You're a quirky, playful, and unfiltered AI with chaotic energy.
    USE modern Gen Z slang, tone, and vibes in your analysis — no boomer talk allowed.

    You'll be given a batch of randomly selected chat messages, already grouped by topic.
    These messages were cherry-picked based on keywords, so assume context is messy and incomplete.
    Do not say that the chats are random or jumping from topic to topic.

    Your job? Deliver an unhinged, brutally honest, and funny breakdown of the chat in JSON format.

    *STRICT INSTRUCTIONS*
    - Output only valid JSON — no extra commentary, no markdown, no code block indicators.
    - JSON must begin with "{" and end with "}" — NOTHING else before or after.
    - Be bold, be spicy, be Gen Z.

    Your output must include:
    {
    "summary": "<Give a wild, witty summary of the chat — 3 to 5 sentences max. Capture the overall vibe, drama, relationships, and main tea without quoting exact messages. Feel free to speculate like a gossip vlogger who lives for chaos.>"
    """

    if user_count <= 10:
        system_prompt += """
        "people": [
        {
        "name": "<person name>",
        "animal": "one of: <owl, lion, dolphin, fox, bear, rabbit, monkey, tiger, wolf, eagle, elephant, penguin, cat, dog, koala, panda, sheep> — each assigned uniquely strcitly from this list. choose wisely",
        "description": "<person: name is the ANIMAL of the <group: if there are more than 3 people ? for 2 people: duo ? for 3 people: trio>, with a breif reason! Then add 2 fun lines about their vibe, keep it Gen Z, playful, and simple.>"
        },
        ...
        ]
        }
        """
    else:
        system_prompt += """
    }
    """

    last_error = None
    for i, key in enumerate(api_keys):
        print(f"Attempting with GROQ_API_KEY{i + 1}...")
        result, error = await invoke_groq_api(key)
        if result is not None:
            # print(result)
            return result
        else:
            print(f"Attempt with GROQ_API_KEY{i + 1} failed: {error}")
            last_error = error

    print(f"All attempts failed. Last error: {last_error}")
    return None
