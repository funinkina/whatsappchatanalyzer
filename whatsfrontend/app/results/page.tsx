// app/results/page.tsx
'use client'; // This component needs client-side hooks (useState, useEffect)

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../styles/Results.module.css'; // Import CSS Module

// Define a type for your expected data structure (optional but recommended)
interface AnalysisData {
    fileName: string;
    fileSize: number;
    analysisTimestamp: string;
    wordCloudData: Array<{ text: string; value: number }>;
    graphData: {
        labels: string[];
        datasets: Array<{
            label: string;
            data: number[];
            borderColor?: string;
            tension?: number;
        }>;
    };
    summary: string;
    // Add other expected fields here
}

export default function ResultsPage() {
    const [data, setData] = useState<AnalysisData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        // This code runs only on the client after the component mounts
        try {
            const storedData = sessionStorage.getItem('analysisData');
            if (storedData) {
                const parsedData: AnalysisData = JSON.parse(storedData);
                setData(parsedData);
                // Optional: Clean up sessionStorage if the data is only needed once
                // sessionStorage.removeItem('analysisData');
            } else {
                setError('No analysis data found. Please upload a file first.');
                // Optional: Redirect back if no data
                // router.push('/');
            }
        } catch (err) {
            console.error("Failed to parse analysis data:", err);
            setError('Failed to load analysis results. Data might be corrupted.');
        } finally {
            setIsLoading(false);
        }
    }, [router]); // Add router to dependency array if using it inside useEffect for navigation

    if (isLoading) {
        return <div className={styles.loading}>Loading results...</div>;
    }

    if (error) {
        return <div className={styles.error}>{error}</div>;
    }

    if (!data) {
        // This case might be hit if data couldn't be loaded but no specific error was set
        return <div className={styles.error}>Analysis data is unavailable.</div>;
    }

    // --- Render the Visualizations (using placeholders) ---
    return (
        <main className={styles.container}>
            <h1>Analysis Results for: {data.fileName}</h1>
            <p>Analyzed on: {new Date(data.analysisTimestamp).toLocaleString()}</p>
            <p>File Size: {data.fileSize} bytes</p>

            <div className={styles.resultSection}>
                <h2>Word Cloud Data</h2>
                {/* Placeholder for Word Cloud */}
                {/* In a real app, use a library like 'react-wordcloud' */}
                <p><em>(Placeholder: Integrate a Word Cloud component here)</em></p>
                <pre className={styles.dataPlaceholder}>
                    {JSON.stringify(data.wordCloudData, null, 2)}
                </pre>
            </div>

            <div className={styles.resultSection}>
                <h2>Graph Data</h2>
                {/* Placeholder for Graph */}
                {/* In a real app, use a library like 'Chart.js' with 'react-chartjs-2' or 'Recharts' */}
                <p><em>(Placeholder: Integrate a Chart component here)</em></p>
                <pre className={styles.dataPlaceholder}>
                    {JSON.stringify(data.graphData, null, 2)}
                </pre>
            </div>

            <div className={styles.resultSection}>
                <h2>Summary</h2>
                <p>{data.summary}</p>
            </div>

            {/* Add more sections for other data in your JSON */}

            <button onClick={() => router.push('/')}>Analyze Another File</button>
        </main>
    );
}