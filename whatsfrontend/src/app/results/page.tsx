"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { ResponsiveLine } from '@nivo/line';

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
    daily_activity: Array<{ day: string; value: number }>;
    average_response_time_minutes: number;
    peak_hour: string;
    // Updated structure for user_monthly_activity
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
    user_interaction_matrix: {
        id: string;
        data: {
            x: string | number;
            y: number | null;
        }[];
    }[] | null;
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

    // Prepare data for User Interaction Heatmap
    const userInteractionKeys = results.user_interaction_matrix
        ? results.user_interaction_matrix[0]?.data.map(d => String(d.x)) ?? []
        : [];

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


                {/* User Interaction Matrix (Heatmap) */}
                {results.user_interaction_matrix && results.user_interaction_matrix.length > 0 && (
                    <section className="p-4 border rounded-lg bg-white shadow-sm">
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">User Interactions Heatmap</h2>
                        <div className="h-96 w-full">
                            <ResponsiveHeatMap
                                data={results.user_interaction_matrix || []}
                                keys={userInteractionKeys}
                                indexBy="id"
                                margin={{ top: 80, right: 110, bottom: 80, left: 110 }}
                                valueFormat=">.0f"
                                axisTop={{
                                    tickSize: 5,
                                    tickPadding: 5,
                                    tickRotation: -45,
                                    legend: 'Recipient User',
                                    legendOffset: -50,
                                    legendPosition: 'middle'
                                }}
                                axisLeft={{
                                    tickSize: 5,
                                    tickPadding: 5,
                                    tickRotation: 0,
                                    legend: 'Sending User',
                                    legendPosition: 'middle',
                                    legendOffset: -72
                                }}
                                colors={{
                                    type: 'sequential',
                                    scheme: 'blues',
                                }}
                                cellOpacity={1}
                                cellBorderColor={{ from: 'color', modifiers: [['darker', 0.4]] }}
                                labelTextColor={{ from: 'color', modifiers: [['darker', 1.8]] }}
                                legends={[
                                    {
                                        anchor: 'bottom',
                                        translateX: 0,
                                        translateY: 30,
                                        length: 400,
                                        thickness: 8,
                                        direction: 'row',
                                        tickPosition: 'after',
                                        tickSize: 3,
                                        tickSpacing: 4,
                                        tickOverlap: false,
                                        tickFormat: '>-.2s',
                                        title: 'Messages Sent →',
                                        titleAlign: 'start',
                                        titleOffset: 4
                                    }
                                ]}
                                animate={true}
                                motionConfig="gentle"
                                hoverTarget="cell"
                                cellHoverOthersOpacity={0.25}
                            />
                        </div>
                    </section>
                )}

                {/* User Monthly Activity using Nivo Line */}
                {results.user_monthly_activity && results.user_monthly_activity.length > 0 && (
                    <section className="p-4 border rounded-lg bg-white shadow-sm">
                        <h2 className="text-xl font-semibold mb-4 text-gray-700">User Monthly Activity</h2>
                        <div className="h-96 w-full">
                            <ResponsiveLine
                                data={[{
                                    id: 'All Users',
                                    data: results.user_monthly_activity.reduce((acc, user) => {
                                        user.data.forEach(item => {
                                            const existing = acc.find(a => a.x === item.x);
                                            if (existing) {
                                                existing.y += item.y;
                                            } else {
                                                acc.push({ ...item });
                                            }
                                        });
                                        return acc;
                                    }, [] as { x: string; y: number }[])
                                }]}
                                margin={{ top: 20, right: 110, bottom: 50, left: 110 }}
                                xScale={{ type: 'point' }}
                                yScale={{
                                    type: 'linear',
                                    min: 'auto',
                                    max: 'auto',
                                    stacked: false,
                                    reverse: false
                                }}
                                axisTop={null}
                                axisRight={null}
                                axisBottom={{
                                    format: (value) => {
                                        const date = new Date(value);
                                        return date.toLocaleDateString('en-US', {
                                            month: 'short',
                                            year: '2-digit'
                                        });
                                    },
                                    tickSize: 5,
                                    tickPadding: 5,
                                    tickRotation: -45
                                }}
                                axisLeft={{
                                    tickSize: 5,
                                    tickPadding: 10, // Increased padding here
                                    tickRotation: 0,
                                    legend: 'Messages',
                                    legendOffset: -90, // Adjust legend offset if needed
                                    legendPosition: 'middle',
                                    tickValues: undefined,
                                    format: value => value.toLocaleString(),
                                }}
                                colors={{ scheme: 'pastel1' }}
                                enablePoints={false}
                                enableGridX={false}
                                enableGridY={false}
                                lineWidth={7}
                                useMesh={true}
                                curve="cardinal"
                                legends={[]}
                                theme={{
                                    axis: {
                                        ticks: {
                                            text: {
                                                fontSize: 14, // Increased font size
                                                fill: '#333', // Changed font color for better visibility
                                                fontWeight: '600'
                                            }
                                        },
                                        legend: {
                                            text: {
                                                fontSize: 16,
                                                fill: '#666',
                                            }
                                        }
                                    }
                                }}
                            />
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}