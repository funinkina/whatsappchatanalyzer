// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded.' }, { status: 400 });
    }

    console.log(`Received file: ${file.name}, Size: ${file.size}, Type: ${file.type}`);

    // --- Backend Processing Placeholder ---
    // In a real app, you would process the file here.
    // Example: Read file content, analyze it, generate data.
    // const fileContent = await file.text(); // or await file.arrayBuffer() for binary
    // const analysisResult = await performAnalysis(fileContent);

    // For this example, we'll just simulate a delay and return mock data.
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate processing time

    const mockData = {
      fileName: file.name,
      fileSize: file.size,
      analysisTimestamp: new Date().toISOString(),
      wordCloud: [
        { text: 'NextJS', value: 64 },
        { text: 'React', value: 45 },
        { text: 'Tailwind', value: 30 },
        { text: 'Serverless', value: 25 },
        { text: 'API', value: 18 },
        { text: 'Upload', value: 55 },
         // ... more words
      ],
      graphData: {
        nodes: [ { id: 'A' }, { id: 'B' }, { id: 'C' } ],
        links: [ { source: 'A', target: 'B'}, { source: 'B', target: 'C'} ]
      },
      sentiment: {
        score: 0.75,
        label: 'Positive'
      }
      // Add other data structures as needed
    };
    // --- End Placeholder ---

    // Return the JSON data
    return NextResponse.json(mockData, { status: 200 });

  } catch (error: any) {
    console.error('API Upload Error:', error);
    return NextResponse.json({ message: 'Failed to process file.', error: error.message }, { status: 500 });
  }
}

// Optional: Define config if you need to increase body size limit for larger files
// export const config = {
//   api: {
//     bodyParser: false, // Required for consuming FormData
//   },
// };
// Note: In App Router, body parsing is handled differently.
// You might need middleware or edge functions for fine-grained control if defaults aren't enough.
// By default, Next.js API routes (App Router) should handle reasonable file sizes.