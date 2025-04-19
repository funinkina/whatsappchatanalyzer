"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Define an interface for the expected data structure
interface AnalysisResults {
    most_active_users: { [username: string]: number };
    conversation_starters: { [username: string]: number };
    most_ignored_users: { [username: string]: number };
    first_text_champion: { user: string; percentage: number };
    common_words: { [word: string]: number };
    common_emojis: { [emoji: string]: number };
    monthly_activity: Array<{ month: string; count: number }>;
    average_response_time_minutes: number;
    peak_hour: string;
}

export default function ResultsPage() {
    const [results, setResults] = useState<AnalysisResults | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        try {
            const storedResults = sessionStorage.getItem('analysisResults');
            if (storedResults) {
                const parsedResults: AnalysisResults = JSON.parse(storedResults);
                setResults(parsedResults);
            } else {
                setError('No analysis results found. Please upload a file first.');
            }
        } catch (err) {
            console.error("Failed to parse results from sessionStorage:", err);
            setError("Could not load analysis results. Data might be corrupted.");
        } finally {
            setIsLoading(false);
        }
    }, [router]);

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-lg text-gray-600">Loading results...</p>
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
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-lg text-gray-600">No results data available.</p>
            </div>
        );
    }

    return (
        <main className="container mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Analysis Results</h1>
            <div className="space-y-8">
                {/* Most Active Users */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Most Active Users</h2>
                    <ul>
                        {Object.entries(results.most_active_users).map(([user, percentage]) => (
                            <li key={user}>
                                {user}: {percentage.toFixed(2)}%
                            </li>
                        ))}
                    </ul>
                </section>

                {/* Conversation Starters */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Conversation Starters</h2>
                    <ul>
                        {Object.entries(results.conversation_starters).map(([user, percentage]) => (
                            <li key={user}>
                                {user}: {percentage.toFixed(2)}%
                            </li>
                        ))}
                    </ul>
                </section>

                {/* Most Ignored Users */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Most Ignored Users</h2>
                    <ul>
                        {Object.entries(results.most_ignored_users)
                            .sort(([, percentageA], [, percentageB]) => percentageB - percentageA)
                            .slice(0, 1)
                            .map(([user]) => (
                                <li key={user}>
                                    {user}
                                </li>
                            ))}
                    </ul>
                </section>

                {/* Common Words */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Common Words</h2>
                    <ul>
                        {Object.entries(results.common_words).map(([word, count]) => (
                            <li key={word}>
                                {word}: {count}
                            </li>
                        ))}
                    </ul>
                </section>

                {/* Common Emojis */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Common Emojis</h2>
                    <ul>
                        {Object.entries(results.common_emojis).map(([emoji, count]) => (
                            <li key={emoji}>
                                {emoji}: {count}
                            </li>
                        ))}
                    </ul>
                </section>

                {/* Monthly Activity */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Monthly Activity</h2>
                    <ul>
                        {results.monthly_activity.map(({ month, count }) => (
                            <li key={month}>
                                {month}: {count} messages
                            </li>
                        ))}
                    </ul>
                </section>

                {/* Average Response Time */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Average Response Time</h2>
                    <p>{results.average_response_time_minutes.toFixed(2)} minutes</p>
                </section>

                {/* Peak Hour */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Peak Hour</h2>
                    <p>{results.peak_hour}</p>
                </section>

                {/* First Text Champion */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">First Text Champion</h2>
                    <p>
                        {results.first_text_champion.user}
                    </p>
                </section>
            </div>
        </main >
    );
}