import { NextRequest, NextResponse } from 'next/server';

interface BackendResponse {
  total_messages: number; // Total number of messages in the chat
  days_since_first_message: number; // Days elapsed since the first message
  most_active_users: {
    [username: string]: number; // Username as key and activity percentage as value
  };
  conversation_starters: {
    [username: string]: number; // Username as key and conversation start percentage as value
  };
  most_ignored_users: {
    [username: string]: number; // Username as key and ignored percentage as value
  };
  first_text_champion: {
    user: string; // Name of the user
    percentage: number; // Percentage of first texts sent
  };
  longest_monologue: {
    user: string; // Name of the user
    count: number; // Count of consecutive messages
  };
  common_words: {
    [word: string]: number; // Word as key and its frequency as value
  };
  common_emojis: {
    [emoji: string]: number; // Emoji as key and its frequency as value
  };
  monthly_activity: Array<{
    month: string; // Month in "YYYY-MM" format
    count: number; // Number of activities/messages in that month
  }>;
  average_response_time_minutes: number; // Average response time in minutes
  peak_hour: string; // Peak activity hour range in "HH:mm - HH:mm" format
  activity_heatmap: {
    [month: string]: {
      [day: string]: number; // Day as key and count as value
    }
  };
  weekday_vs_weekend_avg: {
    average_weekday_messages: number;
    average_weekend_messages: number;
    difference: number;
    percentage_difference: number;
  };
  user_interaction_matrix?: {
    [username: string]: {
      [username: string]: number; // Username as key and interaction count as value
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    // console.log('Request received:', request);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded.' }, { status: 400 });
    }

    console.log(`Received file: ${file.name}, Size: ${file.size}, Type: ${file.type}`);

    // Prepare the file for sending to the backend
    const backendFormData = new FormData();
    backendFormData.append('file', file);


    // Make a POST request to the backend service
    const response = await fetch('http://localhost:8000/analyze/', {
      method: 'POST',
      body: backendFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend Error:', errorText);
      return NextResponse.json({ message: 'Failed to process file on backend.', error: errorText }, { status: response.status });
    }

    // Parse the response from the backend
    const analysisResult: BackendResponse = await response.json();

    // Return the backend response to the client
    return NextResponse.json(analysisResult, { status: 200 });

  } catch (error: unknown) {
    console.error('API Upload Error:', error);

    // Narrow down the error type
    if (error instanceof Error) {
      return NextResponse.json({ message: 'Failed to process file.', error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'An unknown error occurred.' }, { status: 500 });
  }
}
