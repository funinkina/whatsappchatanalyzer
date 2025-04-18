// src/app/results/page.tsx
"use long"; // Required for using hooks like useState, useEffect

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Define an interface for the expected data structure
interface AnalysisResults {
    fileName: string;
    fileSize: number;
    analysisTimestamp: string;
    wordCloud: { text: string; value: number }[];
    graphData: {
        nodes: { id: string }[];
        links: { source: string; target: string }[];
    };
    sentiment: {
        score: number;
        label: string;
    };
    // Add other expected fields
}

export default function ResultsPage() {
    const [results, setResults] = useState<AnalysisResults | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        // This code runs only on the client after the component mounts
        try {
            const storedResults = sessionStorage.getItem('analysisResults');
            if (storedResults) {
                const parsedResults: AnalysisResults = JSON.parse(storedResults);
                setResults(parsedResults);
                // Optional: Remove item after reading if it's only needed once
                // sessionStorage.removeItem('analysisResults');
            } else {
                // Handle cases where the user navigates directly to /results
                // or if sessionStorage is empty/cleared
                setError('No analysis results found. Please upload a file first.');
                // Optional: Redirect back to home page after a delay
                // setTimeout(() => router.push('/'), 3000);
            }
        } catch (err) {
            console.error("Failed to parse results from sessionStorage:", err);
            setError("Could not load analysis results. Data might be corrupted.");
        } finally {
            setIsLoading(false);
        }
        // Empty dependency array ensures this effect runs only once on mount
    }, [router]); // Include router if you use it inside useEffect for navigation

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-lg text-gray-600">Loading results...</p>
                {/* You could add a spinner here */}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6 text-center">
                <div>
                    <p className="text-lg text-red-600">{error}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Go to Upload
                    </button>
                </div>
            </div>
        );
    }

    if (!results) {
        // This case should ideally be covered by the error state, but good for safety
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-lg text-gray-600">No results data available.</p>
            </div>
        );
    }

    // --- Display the Results ---
    // Replace the <pre> tags with your actual visualization components
    return (
        <main className="container mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Analysis Results</h1>
            <div className="space-y-8">
                {/* File Info Section */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">File Information</h2>
                    <p><strong>Name:</strong> {results.fileName}</p>
                    <p><strong>Size:</strong> {(results.fileSize / 1024).toFixed(2)} KB</p>
                    <p><strong>Analyzed At:</strong> {new Date(results.analysisTimestamp).toLocaleString()}</p>
                </section>

                {/* Word Cloud Section */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Word Cloud Data</h2>
                    {/* Placeholder: Replace with your actual Word Cloud component */}
                    <div className="bg-gray-100 p-4 rounded h-64 overflow-auto">
                        <p className="text-sm text-gray-500 mb-2">(Visualization component goes here)</p>
                        <pre className="text-xs">{JSON.stringify(results.wordCloud, null, 2)}</pre>
                    </div>
                </section>

                {/* Graph Data Section */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Graph Data</h2>
                    {/* Placeholder: Replace with your actual Graph component */}
                    <div className="bg-gray-100 p-4 rounded h-64 overflow-auto">
                        <p className="text-sm text-gray-500 mb-2">(Visualization component goes here)</p>
                        <pre className="text-xs">{JSON.stringify(results.graphData, null, 2)}</pre>
                    </div>
                </section>

                {/* Sentiment Section */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Sentiment Analysis</h2>
                    <p><strong>Label:</strong> {results.sentiment.label}</p>
                    <p><strong>Score:</strong> {results.sentiment.score.toFixed(2)}</p>
                </section>

                {/* Add more sections for other data as needed */}

                <div className="text-center mt-8">
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Analyze Another File
                    </button>
                </div>
            </div>
        </main>
    );
}