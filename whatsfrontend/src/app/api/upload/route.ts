import { NextRequest, NextResponse } from 'next/server';

interface Stats {
  total_messages: number;
  days_active: number | null;
  user_message_count: { [username: string]: number };
  most_active_users_pct: { [username: string]: number };
  conversation_starters_pct: { [username: string]: number };
  most_ignored_users_pct: { [username: string]: number };
  first_text_champion: {
    user: string | null;
    count: number;
  };
  longest_monologue: {
    user: string | null;
    count: number;
  };
  common_words: {
    [word: string]: number;
  };
  common_emojis: {
    [emoji: string]: number;
  };
  average_response_time_minutes: number;
  peak_hour: number | null;
  user_monthly_activity: Array<{
    id: string;
    data: Array<{
      x: string;
      y: number;
    }>;
  }>;
  weekday_vs_weekend_avg: {
    average_weekday_messages: number;
    average_weekend_messages: number;
    difference: number;
    percentage_difference: number;
  };
  user_interaction_matrix?: (string | number | null)[][] | null;
}

interface PersonAnalysis {
  name: string;
  animal: string;
  description: string;
  fun_lines?: string[];
}

interface AiAnalysis {
  summary: string;
  people?: PersonAnalysis[];
  error?: string;
}

interface BackendResponse {
  chat_name?: string;
  total_messages: number;
  stats: Stats;
  ai_analysis: AiAnalysis | null;
  processing_time_seconds?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded.' }, { status: 400 });
    }

    console.log(`Received file: ${file.name}, Size: ${file.size}, Type: ${file.type}`);

    const backendFormData = new FormData();
    backendFormData.append('file', file);

    const apiKey = process.env.VAL_API_KEY;

    if (!apiKey) {
      console.error('API_KEY not configured in environment variables');
      return NextResponse.json({ message: 'API key configuration missing' }, { status: 500 });
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/analyze/`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey
      },
      body: backendFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend Error:', errorText);
      return NextResponse.json({ message: 'Failed to process file on backend.', error: errorText }, { status: response.status });
    }

    const analysisResult: BackendResponse = await response.json();

    return NextResponse.json(analysisResult, { status: 200 });

  } catch (error: unknown) {
    console.error('API Upload Error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ message: 'Failed to process file.', error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'An unknown error occurred.' }, { status: 500 });
  }
}
