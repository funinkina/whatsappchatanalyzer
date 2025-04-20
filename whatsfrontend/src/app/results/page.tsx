"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveChord } from '@nivo/chord';
import { ResponsivePie } from '@nivo/pie';
import { Wordcloud } from '@visx/wordcloud';
import { scaleLog } from '@visx/scale';
import { Text } from '@visx/text';

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
    user_interaction_matrix: (string | number | null)[][] | null; // Updated type
}

// Define interface for word data used by Wordcloud
interface WordData {
    text: string;
    value: number;
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

    // Prepare data for User Interaction Chord Diagram
    const chordKeys = results.user_interaction_matrix && results.user_interaction_matrix.length > 1
        ? results.user_interaction_matrix[0]?.slice(1).map(String) ?? []
        : [];

    const chordMatrix = results.user_interaction_matrix && results.user_interaction_matrix.length > 1
        ? results.user_interaction_matrix.slice(1).map(row => row.slice(1).map(value => (typeof value === 'number' ? value : 0)))
        : [];

    // Prepare data for Wordcloud
    const commonWordsData: WordData[] = Object.entries(results.common_words).map(([text, value]) => ({
        text,
        value,
    }));

    // Define scales for Wordcloud
    const fontScale = scaleLog({
        domain: [Math.min(...commonWordsData.map(w => w.value)), Math.max(...commonWordsData.map(w => w.value))],
        range: [10, 200], // Adjust min/max font size as needed
    });
    const fontSizeSetter = (datum: WordData) => fontScale(datum.value);

    // Fixed colors for simplicity, could be dynamic
    const fixedValueGenerator = () => 0.1; // Adjust rotation if needed

    return (
        <main className="container mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Analysis Results</h1>
            <div className="space-y-8">
                {/* Overall Chat Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Total Messages</h2>
                        <p>{results.total_messages.toLocaleString()}</p>
                    </section>

                    {/* Days Since First Message */}
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Days Since First Message</h2>
                        <p>{results.days_since_first_message} {results.days_since_first_message === 1 ? 'day' : 'days'}</p>
                    </section>

                    {/* Most Ignored Users */}
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">who gets ignored the most?</h2>
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
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">who texts first usually?</h2>
                        <p>
                            {results.first_text_champion.user}: {results.first_text_champion.percentage.toFixed(2)}%
                        </p>
                    </section>

                    {/* Longest Monologue */}
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Longest Monologue</h2>
                        <p>
                            {results.longest_monologue.user}: {results.longest_monologue.count} consecutive messages
                        </p>
                    </section>

                    {/* Average Response Time */}
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Average Response Time</h2>
                        <p>{results.average_response_time_minutes.toFixed(2)} minutes</p>
                    </section>
                </div>

                {/* Most Active Users and Conversation Starters in a Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Most Active Users</h2>
                        <div style={{ height: '300px' }}>
                            <ResponsivePie
                                data={Object.entries(results.most_active_users).map(([user, percentage]) => ({
                                    id: user,
                                    label: user,
                                    value: percentage,
                                }))}
                                margin={{ top: 40, bottom: 40 }}
                                innerRadius={0}
                                padAngle={0}
                                cornerRadius={5}
                                activeOuterRadiusOffset={10}
                                borderWidth={1}
                                colors={{ scheme: 'pastel1' }}
                                enableArcLabels={false}
                            />
                        </div>
                    </section>

                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Conversation Starters</h2>
                        <div style={{ height: '300px' }}>
                            <ResponsivePie
                                data={Object.entries(results.conversation_starters).map(([user, percentage]) => ({
                                    id: user,
                                    label: user,
                                    value: percentage,
                                }))}
                                margin={{ top: 40, bottom: 40 }}
                                innerRadius={0}
                                padAngle={0.7}
                                cornerRadius={3}
                                activeOuterRadiusOffset={8}
                                borderWidth={1}
                                borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                                colors={{ scheme: 'pastel2' }}
                                enableArcLabels={false}
                            />
                        </div>
                    </section>
                </div>


                {/* Common Words and Emojis in a Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Common Words - Replaced with Wordcloud */}
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Common Words</h2>
                        <div style={{ height: '400px', width: '100%' }}> {/* Adjust height as needed */}
                            <Wordcloud<WordData>
                                words={commonWordsData}
                                width={500} // Example width, make responsive if needed
                                height={400} // Example height
                                fontSize={fontSizeSetter}
                                font={'Impact'}
                                padding={2}
                                spiral={'archimedean'}
                                rotate={0}
                                random={fixedValueGenerator}
                            >
                                {(cloudWords) =>
                                    cloudWords.map((w, i) => (
                                        <Text
                                            key={w.text}
                                            fill={['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'][i % 6]}
                                            textAnchor={'middle'}
                                            transform={`translate(${w.x}, ${w.y}) rotate(${w.rotate})`}
                                            fontSize={w.size}
                                            fontFamily={w.font}
                                        >
                                            {w.text}
                                        </Text>
                                    ))
                                }
                            </Wordcloud>
                        </div>
                    </section>

                    {/* Common Emojis */}
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Common Emojis</h2>
                        <ul>
                            {Object.entries(results.common_emojis).map(([emoji, count]) => (
                                <li key={emoji}>
                                    {emoji}: {count}
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>

                {/* Peak Hour and User Interaction Matrix in a Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Peak Hour */}
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] flex flex-col items-center justify-center text-center">
                        <h2 className="text-xl font-semibold mb-2 text-gray-700">Peak Activity Hour</h2>
                        <p className="text-4xl font-bold text-indigo-600">{results.peak_hour}</p>
                        <p className="text-sm text-gray-500 mt-1">Highest message volume</p>
                        {/* You could also add a clock icon here using an icon library */}
                    </section>

                    {/* User Interaction Matrix (Chord Diagram) */}
                    {results.user_interaction_matrix && chordKeys.length > 2 && chordMatrix.length > 2 && (
                        <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                            <h2 className="text-xl font-semibold mb-4 text-gray-700">User Interactions Chord Diagram</h2>
                            <div className="h-96 w-full">
                                <ResponsiveChord
                                    data={chordMatrix}
                                    keys={chordKeys}
                                    margin={{ top: 40, right: 10, bottom: 40, left: 10 }}
                                    valueFormat=".0f"
                                    padAngle={0.05}
                                    innerRadiusRatio={0.96}
                                    innerRadiusOffset={0}
                                    enableLabel={true}
                                    label="id"
                                    labelOffset={15}
                                    labelRotation={0}
                                    colors={{ scheme: 'dark2' }}
                                    isInteractive={true}
                                    animate={true}
                                    motionConfig="gentle"
                                // legends={[
                                //     {
                                //         anchor: 'top-left',
                                //         direction: 'column',
                                //         justify: false,
                                //         translateX: 0,
                                //         translateY: 0,
                                //         itemWidth: 100,
                                //         itemHeight: 20,
                                //         itemsSpacing: 10,
                                //         symbolSize: 10,
                                //         itemDirection: 'left-to-right'
                                //     }
                                // ]}
                                />
                            </div>
                        </section>
                    )}

                    {/* Weekday vs Weekend Activity */}
                    {chordKeys.length <= 2 && (
                        <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
                            <h2 className="text-xl font-semibold mb-2 text-gray-700">Weekday vs Weekend Activity</h2>
                            <div className="h-64">
                                <ResponsivePie
                                    data={[
                                        { id: 'Weekday', label: 'Weekday', value: results.weekday_vs_weekend_avg.average_weekday_messages },
                                        { id: 'Weekend', label: 'Weekend', value: results.weekday_vs_weekend_avg.average_weekend_messages },
                                    ]}
                                    margin={{ top: 40, bottom: 40 }}
                                    innerRadius={0}
                                    padAngle={0.7}
                                    cornerRadius={0}
                                    enableArcLabels={false}
                                    activeOuterRadiusOffset={0}
                                    borderWidth={1}
                                    colors={{ scheme: 'pastel1' }}
                                />
                            </div>
                        </section>
                    )}
                </div>

                {/* User Monthly Activity using Nivo Line */}
                {results.user_monthly_activity && results.user_monthly_activity.length > 0 && (
                    <section className="p-4 border-2 border-neutral-800 rounded-lg bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]">
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
                                margin={{ top: 20, right: 60, bottom: 50, left: 120 }}
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