import os
import asyncio
import json
import logging
from collections import Counter

from dotenv import load_dotenv
from groq import AsyncGroq, RateLimitError, APIError
from utils import group_messages_by_topic, stratify_messages

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

load_dotenv()
logger = logging.getLogger(__name__)

GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

GROQ_MAX_TOKENS = 4096
GROQ_TEMPERATURE = 1.3
RETRY_ATTEMPTS = 3
RETRY_WAIT_MIN_SECONDS = 1
RETRY_WAIT_MAX_SECONDS = 5

ALL_KEYS = {i: os.getenv(f"GROQ_API_KEY{i}") for i in list(range(1, 8)) + [9]}

PRIMARY_KEYS = {i: key for i, key in ALL_KEYS.items() if i in range(1, 8) and key}
FALLBACK_KEY = ALL_KEYS.get(9)

if not PRIMARY_KEYS and not FALLBACK_KEY:
    logger.error(
        "CRITICAL: No valid GROQ_API_KEYs (1-7 or 9) found in environment variables. AI Analysis disabled."
    )
else:
    logger.info(
        f"Found {len(PRIMARY_KEYS)} primary Groq keys and {'1 fallback key' if FALLBACK_KEY else 'no fallback key'}."
    )

_primary_key_indices = list(PRIMARY_KEYS.keys())
_current_primary_key_index = 0
_key_rotation_lock = asyncio.Lock()


async def get_next_primary_key():
    """Safely gets the next primary key index and value using round-robin."""
    if not _primary_key_indices:
        return None, None

    async with _key_rotation_lock:
        global _current_primary_key_index
        key_num = _primary_key_indices[_current_primary_key_index]
        key_value = PRIMARY_KEYS[key_num]
        _current_primary_key_index = (_current_primary_key_index + 1) % len(
            _primary_key_indices
        )
        return key_num, key_value


RETRYABLE_ERRORS = (
    RateLimitError,
    APIError,
    asyncio.TimeoutError,
)

retry_decorator = retry(
    stop=stop_after_attempt(RETRY_ATTEMPTS),
    wait=wait_exponential(
        multiplier=1, min=RETRY_WAIT_MIN_SECONDS, max=RETRY_WAIT_MAX_SECONDS
    ),
    retry=retry_if_exception_type(RETRYABLE_ERRORS),
    before_sleep=lambda retry_state: logger.warning(
        f"Retrying Groq API call (attempt {retry_state.attempt_number}) after error: {retry_state.outcome.exception()}"
    ),
)


@retry_decorator
async def invoke_groq(
    api_key: str, key_name: str, system_prompt: str, user_content: str
):
    """Invokes the Groq API for a single key, with retry logic."""
    if not api_key:

        raise ValueError(f"Attempted to call Groq with empty API key ({key_name})")

    logger.info(f"Attempting Groq analysis with {key_name}...")
    try:
        client = AsyncGroq(api_key=api_key)

        response = await client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=GROQ_TEMPERATURE,
            max_tokens=GROQ_MAX_TOKENS,
            response_format={"type": "json_object"},
        )
        if response and response.choices:
            content = response.choices[0].message.content

            if (
                content
                and content.strip().startswith("{")
                and content.strip().endswith("}")
            ):
                try:

                    json.loads(content)
                    logger.info(f"Successfully received valid JSON with {key_name}.")
                    return content
                except json.JSONDecodeError as json_err:

                    error_msg = f"Invalid JSON received with {key_name}: {json_err}. Content: {content[:100]}..."
                    logger.error(error_msg)
                    raise ValueError(error_msg)
            else:

                error_msg = f"Output from {key_name} does not look like JSON. Content: {content[:100]}..."
                logger.error(error_msg)
                raise ValueError(error_msg)
        else:

            error_msg = f"No valid choices returned from Groq with {key_name}. Response: {response}"
            logger.error(error_msg)

            raise APIError(error_msg)

    except (RateLimitError, APIError, asyncio.TimeoutError) as e:
        logger.warning(
            f"Retryable Groq API Error with {key_name}: {type(e).__name__} - {e}"
        )
        raise

    except Exception as e:

        logger.error(
            f"Unexpected Error during Groq call with {key_name}: {type(e).__name__} - {e}",
            exc_info=True,
        )

        raise APIError(f"Unexpected error: {e}") from e


async def analyze_messages_with_llm(data, gap_hours=6):
    """
    Analyze messages using Groq API with key rotation, retries, and improved error handling.
    """
    if not PRIMARY_KEYS and not FALLBACK_KEY:
        logger.warning("Skipping AI Analysis: No Groq API keys configured.")
        return None

    topics = group_messages_by_topic(data, gap_hours)
    stratified_topics = stratify_messages(topics)

    try:
        grouped_messages_json = json.dumps(stratified_topics, indent=2)
    except TypeError as e:
        logger.error(f"Failed to serialize messages for LLM: {e}", exc_info=True)
        return None

    if not grouped_messages_json or grouped_messages_json == "[]":
        logger.warning("No messages to analyze after grouping and stratifying.")
        return None

    unique_users = Counter([message[2] for message in data]).keys()
    user_count = len(unique_users)

    system_prompt = """
    You are a Gen Z teenager judging a group chat. You're a quirky, playful, and unfiltered AI with chaotic energy.
    USE modern Gen Z slang, tone, and vibes in your analysis — no boomer talk allowed. You are not any LLM, AI or therapist.

    You'll be given a batch of randomly selected chat messages, already grouped by topic.
    These messages were cherry-picked based on keywords, so assume context is messy and incomplete.

    Your task is to Deliver an unhinged, brutally honest, and funny breakdown of the chat in JSON format.
    But remember to not actually make fun of the people in the chat. Just be a little spicy, okay?
    And make sure to analyse all the people in the chat.

    *DO NOT DO THE FOLLOWING*:
    - Do NOT say that the chats are random or jumping from topic to topic.
    - Do NOT say that you are an AI or LLM.
    - Do NOT say that this chat is a mess, jumbled, or chaotic.

    *STRICT INSTRUCTIONS*:
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
        system_prompt += """
    }
    """

    last_exception = None

    num_primary_keys = len(PRIMARY_KEYS)
    for _ in range(num_primary_keys):
        key_num, key_to_try = await get_next_primary_key()
        if key_num is None:
            break

        key_name = f"Primary Key #{key_num}"
        try:
            result = await invoke_groq(
                key_to_try, key_name, system_prompt, grouped_messages_json
            )
            return result
        except Exception as e:
            logger.warning(f"Failed attempt with {key_name}: {e}")
            last_exception = e

    if FALLBACK_KEY:
        key_name = "Fallback Key #9"
        try:
            logger.info("Primary keys failed or unavailable, attempting fallback key.")
            result = await invoke_groq(
                FALLBACK_KEY, key_name, system_prompt, grouped_messages_json
            )
            return result
        except Exception as e:
            logger.error(f"Fallback key {key_name} also failed: {e}")
            last_exception = e

    logger.error(
        f"All Groq API key attempts failed. Last error: {last_exception}",
        exc_info=last_exception is not None,
    )
    return None
