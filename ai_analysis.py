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
        Structured analysis from the Groq API as a JSON string, or None if analysis fails.
    """
    topics = group_messages_by_topic(data, gap_hours)
    stratified_topics = stratify_messages(topics)
    grouped_messages_json = json.dumps(stratified_topics, indent=2)

    if not grouped_messages_json or grouped_messages_json == "[]":
        print("Error: No messages to analyze after grouping and stratifying.")
        return None

    unique_users = Counter([message[2] for message in data]).keys()
    user_count = len(unique_users)

    groq_api_key1 = os.getenv("GROQ_API_KEY1")
    groq_api_key2 = os.getenv("GROQ_API_KEY2")
    groq_api_key3 = os.getenv("GROQ_API_KEY3")

    api_keys = [key for key in [groq_api_key1, groq_api_key2, groq_api_key3] if key]

    if not api_keys:
        print("Error: No valid GROQ_API_KEY found in environment variables.")
        return None

    async def invoke_groq_api(api_key):
        if not api_key:
            return None, "API key not provided"
        try:
            client = AsyncGroq(api_key=api_key)
            response = await client.chat.completions.create(
                model="llama3-70b-8192",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": grouped_messages_json}
                ],
                temperature=1.0,
                max_tokens=2048,
                response_format={"type": "json_object"}
            )
            if response and response.choices:
                content = response.choices[0].message.content
                # Basic check if it looks like JSON
                if content and content.strip().startswith('{') and content.strip().endswith('}'):
                    try:
                        json.loads(content)
                        return content, None
                    except json.JSONDecodeError as json_err:
                        return None, f"Invalid JSON received: {json_err}. Content: {content[:100]}..."
                else:
                    return None, f"Output does not look like JSON. Content: {content[:100]}..."
            else:
                return None, "No valid choices returned from Groq."
        except Exception as e:
            # Log the full error for debugging but return a simpler message
            print(f"Groq API Error details: {e}")
            return None, f"Error connecting to Groq API: {type(e).__name__}"

    system_prompt = """
    You are a Gen Z teenager judging a group chat. You're a quirky, playful, and unfiltered AI with chaotic energy.
    USE modern Gen Z slang, tone, and vibes in your analysis — no boomer talk allowed.

    You'll be given a batch of randomly selected chat messages, already grouped by topic.
    These messages were cherry-picked based on keywords, so assume context is messy and incomplete.
    Do not say that the chats are random or jumping from topic to topic.

    Your job? Deliver an unhinged, brutally honest, and funny breakdown of the chat in JSON format.

    *STRICT INSTRUCTIONS*
    - Output ONLY valid JSON.
    - Your entire response must start with `{` and end with `}`.
    - NO extra text, commentary, markdown, or code block indicators before or after the JSON object.
    - Be bold, be spicy, be Gen Z.

    Your output JSON object MUST include the following keys:
    "summary": "<Give a wild, witty summary of the chat — 3 to 5 sentences max. Capture the overall vibe, drama, relationships, and main tea without quoting exact messages. Feel free to speculate like a gossip vlogger who lives for chaos.>"
    """

    if user_count <= 10:
        system_prompt += """,
        "people": [
        {
        "name": "<person name>",
        "animal": "one of: <owl, lion, dolphin, fox, bear, rabbit, monkey, tiger, wolf, eagle, elephant, penguin, cat, dog, koala, panda, sheep> — each assigned uniquely strictly from this list. choose wisely",
        "description": "<person's name is the ANIMAL of the <'group' if count > 3 else 'trio' if count == 3 else 'duo'>, with a brief reason! Then add 2 fun lines about their vibe, keep it Gen Z, playful, and simple.>"
        }
        // ... include one object for each unique person in the chat
        ]
    }
    """
    else:
        # Close the JSON object if 'people' key is not added
        system_prompt += """
    }
    """
    if user_count > 10:
        system_prompt = system_prompt.strip()

    last_error = "No attempts made."
    for i, key in enumerate(api_keys):
        print(f"Attempting analysis with API Key {i + 1}...")
        result, error = await invoke_groq_api(key)

        if result is not None:
            # We already validated JSON in invoke_groq_api
            print(f"Successfully received valid JSON with API Key {i + 1}.")
            # print(result) # Optional: print the successful JSON result
            return result
        else:
            print(f"Attempt with API Key {i + 1} failed: {error}")
            last_error = error

    print(f"All API key attempts failed. Last error: {last_error}")
    return None
