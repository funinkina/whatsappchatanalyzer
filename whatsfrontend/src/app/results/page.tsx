"use client";

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveChord } from '@nivo/chord';
import { ResponsivePie } from '@nivo/pie';
import AIAnalysis from '@/components/AIAnalysis';
import ChatStatistic from '@/components/ChatStatistics';
import domtoimage from 'dom-to-image';

// Define an interface for the expected data structure
interface AnalysisResults {
  chat_name?: string;
  total_messages: number;
  days_since_first_message: number;
  most_active_users: { [username: string]: number };
  conversation_starters: { [username: string]: number };
  most_ignored_users: { [username: string]: number };
  first_text_champion: { user: string; percentage: number };
  longest_monologue: { user: string; count: number };
  common_words: { [word: string]: number };
  common_emojis: { [emoji: string]: number };
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
  user_interaction_matrix: (string | number | null)[][] | null;
  ai_analysis: {
    summary: string;
    people: Array<{
      name: string;
      animal: string;
      description: string;
    }>;
  };
}

// Define interface for word data
export default function ResultsPage() {
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [topWords, setTopWords] = useState<{ text: string; value: number }[]>([]);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const wordContainerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  useEffect(() => {
    try {
      const storedResults = sessionStorage.getItem('analysisResults');
      if (storedResults) {
        const parsedResults: AnalysisResults = JSON.parse(storedResults);

        if (!parsedResults.ai_analysis) {
          parsedResults.ai_analysis = {
            summary: "AI analysis not available.",
            people: []
          };
        } else if (typeof parsedResults.ai_analysis === 'string') {
          try {
            parsedResults.ai_analysis = JSON.parse(parsedResults.ai_analysis as unknown as string);
          } catch (e) {
            console.error("Failed to parse AI analysis from string:", e);
            parsedResults.ai_analysis = {
              summary: parsedResults.ai_analysis as unknown as string,
              people: []
            };
          }
        }

        if (!parsedResults.ai_analysis.people) {
          parsedResults.ai_analysis.people = [];
        }

        setResults(parsedResults);
        console.log("AI Analysis data:", parsedResults.ai_analysis);

        if (parsedResults.common_words) {
          const sortedWords = Object.entries(parsedResults.common_words)
            .map(([text, value]) => ({ text: text.toUpperCase(), value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6); // Get top 6

          setTopWords(sortedWords);
        }

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

  useEffect(() => {
    const measureContainer = () => {
      if (wordContainerRef.current) {
        setContainerWidth(wordContainerRef.current.clientWidth);
      }
    };

    measureContainer();
    window.addEventListener('resize', measureContainer);

    return () => window.removeEventListener('resize', measureContainer);
  }, [topWords]);

  // Define min/max font size constraints
  const minCharSize = 1.0;
  const absoluteMaxCharSize = 7.0;

  const getCharSize = (count: number, text: string) => {
    const baseFontSize = 16;

    if (!containerWidth || topWords.length === 0) {
      return `${minCharSize}rem`;
    }

    const topWord = topWords[0];
    const N = topWord.text.length;

    const frequencyCountWidthEstimate = 60;
    const availableWidthForWord = Math.max(10, containerWidth - frequencyCountWidthEstimate);

    let idealFontSizeRem = absoluteMaxCharSize;
    if (N > 0) {
      const estimatedFontSizePx = (availableWidthForWord - N * 8 - Math.max(0, N - 1) * 4) / N;
      idealFontSizeRem = estimatedFontSizePx / baseFontSize;
    }

    const dynamicMaxCharSize = Math.max(minCharSize, Math.min(absoluteMaxCharSize, idealFontSizeRem));

    if (text === topWord.text) {
      return `${Math.max(minCharSize, dynamicMaxCharSize).toFixed(2)}rem`;
    }
    const minCountDisplayed = topWords.length > 0 ? topWords[topWords.length - 1].value : 1;
    const effectiveMaxCount = Math.max(topWord.value, 1);
    const effectiveMinCount = Math.max(minCountDisplayed, 1);

    if (effectiveMaxCount <= effectiveMinCount || count <= effectiveMinCount) {
      return `${minCharSize}rem`;
    }

    const scale = (count - effectiveMinCount) / (effectiveMaxCount - effectiveMinCount);
    const size = minCharSize + (dynamicMaxCharSize - minCharSize) * scale;

    const clampedSize = Math.max(minCharSize, Math.min(dynamicMaxCharSize, size));

    return `${clampedSize.toFixed(2)}rem`;
  };

  // Define the list of background colors
  const bgColors = [
    'bg-rose-100',
    'bg-green-100',
    'bg-pink-100',
    'bg-purple-100',
    'bg-sky-100',
    'bg-violet-100',
  ];

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

  // Prepare data for Common Emojis visualization
  const sortedEmojis = Object.entries(results.common_emojis)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);

  const handleDownload = async () => {
    if (sectionRef.current === null) return;

    setIsDownloading(true);
    const elementToCapture = sectionRef.current;
    const elementsToHide = elementToCapture.querySelectorAll('[data-exclude-from-download="true"]');

    const targetWidth = 1200;
    const originalStyle = elementToCapture.style.cssText;

    try {
      elementsToHide.forEach(el => el.classList.add('hidden-for-download'));

      const currentWidth = elementToCapture.offsetWidth;
      const currentHeight = elementToCapture.offsetHeight;

      if (currentWidth <= 0 || currentHeight <= 0) {
        throw new Error("Cannot capture element with zero dimensions after hiding elements.");
      }

      const scale = targetWidth / currentWidth;
      const targetHeight = currentHeight * scale;

      elementToCapture.style.transform = `scale(${scale})`;
      elementToCapture.style.transformOrigin = 'top left';

      const options = {
        quality: 0.98,
        bgcolor: '#fffbeb',
        width: targetWidth,
        height: targetHeight,
        style: {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${currentWidth}px`,
          height: `${currentHeight}px`,
        },
        filter: (node: Node) => {
          // Keep the SVG filter
          if (node instanceof Element && node.tagName === 'svg') {
            const hasForeignObject = node.querySelector('foreignObject');
            return !hasForeignObject;
          }
          if (node instanceof Element && node.classList.contains('hidden-for-download')) {
            return false;
          }
          return true;
        },
      };

      const dataUrl = await domtoimage.toPng(elementToCapture, options);

      const link = document.createElement('a');
      link.download = `chat-analysis-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err: unknown) {
      console.error('Error generating image:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to generate image: ${errorMessage}`);
    } finally {
      elementsToHide.forEach(el => el.classList.remove('hidden-for-download'));
      elementToCapture.style.cssText = originalStyle;
      setIsDownloading(false);
    }
  };

  return (
    <main className="container mx-auto p-6">
      <div className="flex flex-col items-center justify-between mb-2">
        <Image
          src="bloop_logo.svg"
          alt="Bloop Logo"
          width={300}
          height={50}
          className='mb-2'
        />
        <h1 className="text-3xl font-bold mb-6 text-gray-800">
          {results.chat_name ? `Analysis with ${results.chat_name}` : "Analysis Results"}
        </h1>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="mb-4 bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" // Add disabled styles
        >
          {isDownloading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Downloading...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z" />
                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z" />
              </svg>
              Download as PNG
            </>
          )}
        </button>
      </div>
      <div className="space-y-8 p-4" ref={sectionRef} >
        {/* Overall Chat Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ChatStatistic
            title="you guys have sent"
            value={results.total_messages.toLocaleString() + " messages"}
            icon="chat.svg"
            altText="Total Messages"
            bgColor="bg-purple-100"
            textColor="text-violet-800"
            iconWidth={40}
            iconHeight={20}
          />

          <ChatStatistic
            title="you&apos;ve been chatting for"
            value={`${results.days_since_first_message} ${results.days_since_first_message === 1 ? 'day' : 'days'}`}
            icon="calendar.svg"
            altText="Days Since First Message"
            bgColor="bg-emerald-100"
            textColor="text-emerald-700"
            iconWidth={48}
            iconHeight={48}
          />

          <ChatStatistic
            title="who gets ghosted the most?"
            value={
              Object.entries(results.most_ignored_users)
                .sort(([, percentageA], [, percentageB]) => percentageB - percentageA)
                .slice(0, 1)
                .map(([user]) => user.split(' ')[0])[0]
            }
            icon="frown.svg"
            altText="Most Ignored Users"
            bgColor="bg-sky-50"
            textColor="text-sky-700"
            iconWidth={48}
            iconHeight={48}
          />

          <ChatStatistic
            title="when does your conversations peak?"
            value={results.peak_hour}
            icon="peak.svg"
            altText="Peak Hour"
            bgColor="bg-sky-100"
            textColor="text-gray-800"
            iconWidth={25}
            iconHeight={48}
          />

          <ChatStatistic
            title="who texts first usually?"
            value={`${results.first_text_champion.user.split(' ')[0]}: ${results.first_text_champion.percentage.toFixed(2)}%`}
            icon="trophy.svg"
            altText="First Text Champion"
            bgColor="bg-violet-100"
            textColor="text-gray-800"
            iconWidth={48}
            iconHeight={48}
          />

          <ChatStatistic
            title="you get the reply back in"
            value={`~ ${results.average_response_time_minutes.toFixed(2)} minutes`}
            icon="time.svg"
            altText="Average Response Time"
            bgColor="bg-red-100"
            textColor="text-orange-700"
            iconWidth={40}
            iconHeight={48}
          />
        </div>

        {/* Common Words and Emojis in a Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Common Words */}
          <section className="p-4 border-2 border-neutral-800 rounded-lg bg-zinc-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <div className='flex items-center justify-between'>
              <h2 className="text-xl font-bold mb-4 text-gray-700">you guys use these {topWords.length} words a lot</h2>
              <Image
                src="/icons/words.svg"
                alt="Common Words"
                width={30}
                height={30}
                className="mr-3"
              />
            </div>
            <div ref={wordContainerRef} className='w-full flex flex-col items-start space-y-3 py-4'>
              {topWords.length > 0 ? (
                topWords.map(({ text, value }, wordIndex) => {
                  const bgColor = bgColors[wordIndex % bgColors.length];
                  // Call getCharSize with text and value
                  const charSizeStyle = getCharSize(value, text);

                  return (
                    <div key={text} className="flex items-baseline space-x-1" title={`${text}: ${value} uses`}>

                      <div className="flex space-x-1">
                        {text.split('').map((char, index) => {
                          return (
                            <span
                              key={`${text}-${index}`}
                              className={`flex items-center justify-center rounded font-bold text-gray-800 ${bgColor}`}
                              style={{
                                fontSize: charSizeStyle,
                                width: `calc(${charSizeStyle} + 0.5rem)`,
                                height: `calc(${charSizeStyle} + 0.5rem)`,
                                lineHeight: '1'
                              }}
                            >
                              {char}
                            </span>
                          );
                        })}
                      </div>
                      <span className="ml-2 text-xs text-gray-500 font-medium">
                        x {value}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500">No common words data available.</p>
              )}
            </div>
          </section>

          {/* Common Emojis */}
          <section className="p-4 lg:h-full md:h-fit  border-2 border-neutral-800 rounded-lg bg-zinc-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]  hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <div className='flex items-center justify-between'>
              <h2 className="text-xl font-semibold mb-4 text-gray-700">can&apos;t get enough of these emojis</h2>
              <Image
                src="/icons/lovely_face.svg"
                alt="Common Emojis"
                width={30}
                height={30}
                className="mr-3"
              />
            </div>
            <div className="flex items-center justify-center h-9/10">
              {sortedEmojis.length > 0 ? (
                <div className="grid grid-cols-3 grid-rows-2 gap-3 h-full w-full items-center justify-center my-16">
                  {sortedEmojis.slice(0, 6).map(({ emoji, count }) => (
                    <span
                      key={emoji}
                      className="flex items-center justify-center text-6xl md:text-8xl"
                      title={`${emoji}: ${count}`}
                    >
                      {emoji}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No common emojis data available.</p>
              )}
            </div>
          </section>
        </div>
        {/* AI Summary and Weekday vs Weekend Activity side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* AI Summary */}
          <section className="p-4 border-2 border-neutral-800 rounded-lg bg-purple-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]  hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-700">wtf was all the yapping about?</h2>
              <Image
                src="/icons/sparkle.svg"
                alt="AI Analysis"
                width={30}
                height={30}
                className="mr-3"
              />
            </div>
            <AIAnalysis
              summary={results.ai_analysis?.summary || ''}
              people={results.ai_analysis?.people || []}
              summaryOnly={true}
            />
          </section>

          {/* weekend vs weekday pie chart */}
          {Object.keys(results.most_active_users).length <= 2 && (
            <section className="p-4 border-2 border-neutral-800 rounded-lg bg-lime-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]  hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
              <div className='flex items-center justify-between mb-4'>
                <h2 className="text-xl font-semibold mb-4 text-gray-700">banter on weekday or relaxing on weekend?</h2>
                <Image
                  src="/icons/tag.svg"
                  alt="Weekday vs Weekend Activity"
                  width={30}
                  height={30}
                  className="mr-3"
                />
              </div>
              <div className="h-80">
                <ResponsivePie
                  data={[
                    { id: 'Weekday', label: 'Weekday', value: results.weekday_vs_weekend_avg.average_weekday_messages },
                    { id: 'Weekend', label: 'Weekend', value: results.weekday_vs_weekend_avg.average_weekend_messages },
                  ]}
                  margin={{ top: 10, bottom: 10 }}
                  innerRadius={0.1}
                  padAngle={0.7}
                  cornerRadius={1}
                  enableArcLinkLabels={false}
                  enableArcLabels={true}
                  arcLabel={e => `${e.id}`}
                  activeOuterRadiusOffset={0}
                  borderWidth={1}
                  colors={{ scheme: 'pastel1' }}
                />
              </div>
            </section>
          )}

          {/* User Interaction Matrix (Chord Diagram) */}
          {results.user_interaction_matrix && chordKeys.length > 2 && chordMatrix.length > 2 && (
            <section className="p-4 border-2 border-neutral-800 rounded-lg bg-lime-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]  hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
              <div className='flex items-center justify-between mb-4'>
                <h2 className="text-xl font-semibold mb-4 text-gray-700">you guys are really chaotic huh?</h2>
                <Image
                  src="/icons/tag.svg"
                  alt="Weekday vs Weekend Activity"
                  width={30}
                  height={30}
                  className="mr-3"
                />
              </div>
              <div className="h-96 w-full">
                <ResponsiveChord
                  data={chordMatrix}
                  keys={chordKeys}
                  margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
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
                />
              </div>
            </section>
          )}
        </div>

        {/* Most Active Users and Conversation Starters in a Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section
            className="p-4 border-2 border-neutral-800 rounded-lg bg-teal-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out"
            data-exclude-from-download="true"
          >
            <div className='flex items-center justify-between'>
              <h2 className="text-xl font-semibold mb-2 text-gray-700">top yappers</h2>
              <Image
                src="/icons/users.svg"
                alt="Most Active Users"
                width={50}
                height={50}
                className="mr-3"
              />
            </div>
            <div className='h-96'>
              <ResponsivePie
                data={Object.entries(results.most_active_users).map(([user, percentage]) => ({
                  id: user,
                  label: user,
                  value: percentage,
                }))}
                margin={{ top: 40, bottom: 40 }}
                innerRadius={0.1}
                padAngle={0}
                cornerRadius={1}
                activeOuterRadiusOffset={10}
                borderWidth={1}
                colors={{ scheme: 'pastel1' }}
                enableArcLabels={true}
                arcLabel={e => `${e.id}`}
                enableArcLinkLabels={false}
              />
            </div>
          </section>

          <section
            className="p-4 border-2 border-neutral-800 rounded-lg bg-teal-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out"
            data-exclude-from-download="true"
          >
            <div className='flex items-center justify-between'>
              <h2 className="text-xl font-semibold mb-2 text-gray-700">first texters</h2>
              <Image
                src="/icons/user.svg"
                alt="Conversation Starters"
                width={30}
                height={30}
                className="mr-3"
              />
            </div>
            <div className='h-96'>
              <ResponsivePie
                data={Object.entries(results.conversation_starters).map(([user, percentage]) => ({
                  id: user,
                  label: user,
                  value: percentage,
                }))}
                margin={{ top: 40, bottom: 40 }}
                innerRadius={0.1}
                padAngle={0.7}
                cornerRadius={1}
                activeOuterRadiusOffset={8}
                borderWidth={1}
                colors={{ scheme: 'pastel2' }}
                enableArcLabels={true}
                arcLabel={e => `${e.id}`}
                enableArcLinkLabels={false}
              />
            </div>
          </section>
        </div>


        {/* AI Analysis - Personality Profiles*/}
        <div className="bg-emerald-50 px-6 rounded-lg shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] border-2 border-neutral-800  hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
          <div className="flex items-center justify-between my-6">
            <h2 className="text-xl font-semibold text-gray-700">what kinda animal are you?</h2>
            <Image
              src="/icons/sparkle.svg"
              alt="AI Analysis"
              width={30}
              height={30}
              className="mr-3"
            />
          </div>
          <AIAnalysis
            summary={results.ai_analysis?.summary || ''}
            people={results.ai_analysis?.people || []}
            profilesOnly={true}
          />
        </div>


        {/* User Monthly Activity using Nivo Line */}
        {results.user_monthly_activity && results.user_monthly_activity.length > 0 && (
          <section className="p-4 mb-20 border-2 border-neutral-800 rounded-lg bg-pink-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]  hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out"
            data-exclude-from-download="true">
            <div className='flex items-center justify-between'>
              <h2 className="text-xl font-semibold mb-4 text-gray-700">how your chats have evolved over time?</h2>
              <Image
                src="/icons/graph_def.svg"
                alt="User Monthly Activity"
                width={30}
                height={30}
                className="mr-3"
              />
            </div>
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
                margin={{ top: 20, right: 20, bottom: 70, left: 70 }}
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
                  tickRotation: typeof window !== 'undefined' && window.innerWidth < 768 ? -90 : -45
                }}
                axisLeft={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Messages',
                  legendOffset: -90,
                  legendPosition: 'middle',
                  tickValues: undefined,
                  format: value => value.toLocaleString(),
                }}
                colors={{ scheme: 'set1' }}
                enablePoints={false}
                enableGridX={false}
                enableGridY={true}
                lineWidth={7}
                useMesh={true}
                curve="cardinal"
                legends={[]}
                theme={{
                  axis: {
                    ticks: {
                      text: {
                        fontSize: 14,
                        fill: '#333',
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