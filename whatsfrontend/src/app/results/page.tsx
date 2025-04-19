"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Define an interface for the expected data structure
interface AnalysisResults {
    total_messages: number;
    days_since_first_message: number;
    most_active_users: { [username: string]: number };
    conversation_starters: { [username: string]: number };
    most_ignored_users: { [username: string]: number };
    first_text_champion: { user: string; percentage: number };
    longest_monologue: { user: string; count: number };
    common_words: { [word: string]: number };
    common_emojis: { [emoji: string]: number };
    monthly_activity: Array<{ month: string; count: number }>;
    average_response_time_minutes: number;
    peak_hour: string;
    activity_heatmap: {
        [day: string]: {
            [hour: string]: number;
        }
    };
    weekday_vs_weekend_avg: {
        average_weekday_messages: number;
        average_weekend_messages: number;
        difference: number;
        percentage_difference: number;
    };
    user_interaction_matrix: {
        [username: string]: {
            [username: string]: number;
        }
    } | null;
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
                {/* Overall Chat Statistics */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Chat Overview</h2>
                    <ul>
                        <li><strong>Total Messages:</strong> {results.total_messages.toLocaleString()}</li>
                        <li><strong>Days Since First Message:</strong> {results.days_since_first_message} {results.days_since_first_message === 1 ? 'day' : 'days'}</li>
                    </ul>
                </section>

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

                {/* First Text Champion */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">First Text Champion</h2>
                    <p>
                        {results.first_text_champion.user}: {results.first_text_champion.percentage.toFixed(2)}%
                    </p>
                </section>

                {/* Longest Monologue */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Longest Monologue</h2>
                    <p>
                        {results.longest_monologue.user}: {results.longest_monologue.count} consecutive messages
                    </p>
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

                {/* Weekday vs Weekend Activity */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Weekday vs Weekend Activity</h2>
                    <ul>
                        <li>Average Weekday Messages: {results.weekday_vs_weekend_avg.average_weekday_messages.toFixed(1)}</li>
                        <li>Average Weekend Messages: {results.weekday_vs_weekend_avg.average_weekend_messages.toFixed(1)}</li>
                        <li>Difference: {results.weekday_vs_weekend_avg.difference.toFixed(1)} messages</li>
                        <li>Percentage Difference: {results.weekday_vs_weekend_avg.percentage_difference.toFixed(2)}%</li>
                    </ul>
                </section>

                {/* Activity Heatmap (Plain text representation) */}
                <section className="p-4 border rounded-lg bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-2 text-gray-700">Activity Heatmap</h2>
                    <p className="mb-2 text-sm">Day and hour distribution of messages</p>
                    <div className="text-xs space-y-2">
                        {Object.entries(results.activity_heatmap).map(([dayNum, hours]) => {
                            // Convert day number to day name (0 = Monday, 6 = Sunday)
                            const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                            const dayName = dayNames[parseInt(dayNum)];

                            return (
                                <div key={dayNum} className="mb-2">
                                    <p className="font-medium">{dayName}:</p>
                                    <ul className="pl-4">
                                        {Object.entries(hours).map(([hour, count]) => (
                                            <li key={`${dayNum}-${hour}`}>
                                                {hour}:00 - {hour}:59: {count} messages
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* User Interaction Matrix (Only shown if data exists) */}
                {results.user_interaction_matrix && (
                    <section className="p-4 border rounded-lg bg-white shadow-sm">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">User Interactions</h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full bg-white border">
                                <thead>
                                    <tr>
                                        <th className="py-2 px-4 border">User</th>
                                        {Object.keys(results.user_interaction_matrix).map(user => (
                                            <th key={user} className="py-2 px-4 border text-xs">{user.split(' ')[0]}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(results.user_interaction_matrix).map(([user, interactions]) => (
                                        <tr key={user}>
                                            <td className="py-2 px-4 border font-medium text-xs">{user.split(' ')[0]}</td>
                                            {results.user_interaction_matrix && Object.keys(results.user_interaction_matrix).map(otherUser => (
                                                <td key={otherUser} className="py-2 px-4 border text-center text-xs">
                                                    {interactions[otherUser] || 0}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}