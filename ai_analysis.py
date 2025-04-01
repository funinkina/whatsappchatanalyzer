import groq
import os
import random
from dotenv import load_dotenv
from main import preprocess_chat

def stratified_sample_chat(data, sample_size_per_user=10):
    """
    Perform stratified sampling on chat data to get a representative sample from each user.

    Args:
        data (dict): Dictionary with usernames as keys and lists of messages as values
        sample_size_per_user (int): Number of messages to sample from each user

    Returns:
        dict: Dictionary with sampled messages for each user
    """
    sampled_data = {}

    for user, messages in data.items():
        if len(messages) <= sample_size_per_user:
            # If we have fewer messages than the sample size, use all of them
            sampled_data[user] = messages
        else:
            # Randomly sample messages without replacement
            sampled_data[user] = random.sample(messages, sample_size_per_user)
    return sampled_data

def analyze_with_llm(sampled_data):
    """
    Send the sampled chat data to an LLM for analysis

    Args:
        sampled_data (dict): Dictionary with sampled messages for each user

    Returns:
        str: LLM's analysis of the chat data
    """
    # Set up the GROQ client
    client = groq.Client(api_key=os.environ.get("GROQ_API_KEY"))

    # Format the data for the LLM
    formatted_data = ""
    for user, messages in sampled_data.items():
        formatted_data += f"\nUser: {user}\n"
        formatted_data += "\n".join([f"- {msg}" for msg in messages])
        formatted_data += "\n"

    # Create the prompt
    prompt = f"""
    Below is a sample of messages from a WhatsApp chat conversation between users.

    {formatted_data}

    Please provide an analysis of this conversation, including:
    1. The main topics discussed
    2. The sentiment and tone of each user
    3. The dynamics between the users
    4. Any patterns or noteworthy observations in their communication
    """
    # Call the LLM
    completion = client.chat.completions.create(
        model="llama3-70b-8192",  # You can change this to another model if needed
        messages=[{"role": "user", "content": prompt}],
        temperature=0.5,
        max_tokens=1024
    )
    return completion.choices[0].message.content

load_dotenv()

data = preprocess_chat(
    chat_file="sample_files/WhatsApp Chat with Aayush Jain GDSC.txt",
    convo_break_minutes=60,
    stopwords_file="stopwords.txt"
)

# Get the conversation data (dictionary of users and their messages)
conversation_data = data[-1]

# Perform stratified sampling
sampled_data = stratified_sample_chat(conversation_data, sample_size_per_user=15)

# Print sample statistics
print("Original message counts:")
for user, messages in conversation_data.items():
    print(f"  {user}: {len(messages)} messages")

print("\nSampled message counts:")
for user, messages in sampled_data.items():
    print(f"  {user}: {len(messages)} messages")

# Analyze the sampled data with an LLM
try:
    analysis = analyze_with_llm(sampled_data)
    print("\nLLM Analysis:")
    print(analysis)
except Exception as e:
    print(f"Error during LLM analysis: {str(e)}")
