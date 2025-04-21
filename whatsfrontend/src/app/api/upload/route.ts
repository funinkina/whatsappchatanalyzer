import { NextRequest, NextResponse } from 'next/server';

interface BackendResponse {
  chat_name?: string; // Chat name extracted from the file
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
  // daily_activity: Array<{ // Changed from monthly_activity
  //   day: string; // format must be YYYY-MM-DD
  //   value: number;
  // }>;
  average_response_time_minutes: number; // Average response time in minutes
  peak_hour: string; // Peak activity hour range in "HH:mm - HH:mm" format
  
  // Updated structure for user_monthly_activity to match what backend returns
  user_monthly_activity: Array<{
    id: string;
    data: Array<{
      x: string; // month in yyyy-mm format
      y: number; // number of messages
    }>;
  }>;
  
  weekday_vs_weekend_avg: {
    average_weekday_messages: number;
    average_weekend_messages: number;
    difference: number;
    percentage_difference: number;
  };
  ai_analysis: {
    summary: string;
    people?: Array<{      // Make people optional since it won't be returned for groups with >10 users
      name: string;
      animal: string;
      description: string;
    }>;
  };
  user_interaction_matrix?: (string | number | null)[][] | null; // Updated type
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

    // Get API key from environment variables
    const apiKey = process.env.VAL_API_KEY;
    
    if (!apiKey) {
      console.error('API_KEY not configured in environment variables');
      return NextResponse.json({ message: 'API key configuration missing' }, { status: 500 });
    }

    // Make a POST request to the backend service
    const backendUrl = process.env.BACKEND_URL || 'https://46c602e8-3700-414a-b57f-9433573d7390.eu-central-1.cloud.genez.io';
    const response = await fetch(`${backendUrl}/analyze/`, {
      method: 'POST',
      headers: {
        // Include the API key in the request headers
        'X-API-Key': apiKey
      },
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
