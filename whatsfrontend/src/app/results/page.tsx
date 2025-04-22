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

const isPhoneNumber = (str: string): boolean => {
  return /^\+\d+\s?\d[\d\s-]{5,}$/.test(str);
};

const filterPhoneNumbers = (data: Record<string, number>): Record<string, number> => {
  return Object.fromEntries(
    Object.entries(data).filter(([user]) => !isPhoneNumber(user))
  );
};

// Filter phone numbers from the user interaction matrix
const filterChordData = (matrix: (string | number | null)[][], keys: string[]) => {
  if (!matrix || matrix.length <= 1 || !keys.length) return { filteredMatrix: [] as number[][], filteredKeys: [] };

  // Find indices of non-phone number users
  const validIndices = keys.map((key, index) => ({ key, index }))
    .filter(item => !isPhoneNumber(item.key))
    .map(item => item.index);

  // Extract filtered keys
  const filteredKeys = validIndices.map(index => keys[index]);

  // Extract rows and columns for non-phone number users
  const filteredMatrix = matrix.slice(1)
    .filter((_, rowIdx) => validIndices.includes(rowIdx))
    .map(row =>
      row.slice(1)
        .filter((_, colIdx) => validIndices.includes(colIdx))
        .map(value => (typeof value === 'number' ? value : 0))
    );

  return { filteredMatrix: filteredMatrix as number[][], filteredKeys };
};

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
        <p className="text-4xl font-bold text-blue-950">Loading results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-lg text-orange-800">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 bg-orange-300 border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] text-blue-950 px-6 py-4 rounded-xl gap-3 transition duration-150 ease-in-out"
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
  const rawChordKeys = results.user_interaction_matrix
    ? results.user_interaction_matrix[0].slice(1).map(key => key as string)
    : [];

  // Apply phone number filtering to chord data
  const { filteredMatrix: chordMatrix, filteredKeys: chordKeys } =
    filterChordData(results.user_interaction_matrix || [], rawChordKeys);

  // Ensure the matrix is always number[][] as required by ResponsiveChord

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

    // Create a container for the watermark and branding
    const brandingDiv = document.createElement('div');
    brandingDiv.style.cssText = `
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px 0;
      margin-bottom: 10px;
      gap: 15px;
    `;

    // Add logo
    const logoImg = document.createElement('img');
    logoImg.src = '/bloop_logo.svg';
    logoImg.alt = 'Bloop Logo';
    logoImg.style.height = '50px';

    // Add text
    const siteText = document.createElement('p');
    siteText.textContent = 'generate your own at bloopit.vercel.app';
    siteText.style.cssText = `
      font-size: 22px;
      font-weight: 600;
      color: #232F61;
      margin: 5;
    `;

    // Assemble the branding element
    brandingDiv.appendChild(logoImg);
    brandingDiv.appendChild(siteText);

    // Insert at the top of the content
    elementToCapture.insertBefore(brandingDiv, elementToCapture.firstChild);

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
      // Remove the branding div when we're done
      if (brandingDiv.parentNode === elementToCapture) {
        elementToCapture.removeChild(brandingDiv);
      }

      elementsToHide.forEach(el => el.classList.remove('hidden-for-download'));
      elementToCapture.style.cssText = originalStyle;
      setIsDownloading(false);
    }
  };

  return (
    <main className="container mx-auto p-6">
      <div className="flex flex-col p-4 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex flex-col items-center md:items-start">
          <Image
            src="bloop_logo.svg"
            alt="Bloop Logo"
            width={300}
            height={50}
            className='mb-2'
          />
          <h1 className="text-3xl font-bold mb-4 md:mb-0 text-gray-800 text-center md:text-left">
            {results.chat_name ? `Analysis with ${results.chat_name}` : "Analysis Results"}
          </h1>
        </div>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="mt-4 md:mt-0 bg-orange-300 border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] text-blue-950 px-6 py-4 rounded-xl flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed self-center md:self-end transition duration-150 ease-in-out"
        >
          {isDownloading ? (
            <>
              <svg width="28" height="35" viewBox="0 0 28 35" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.5092 5.26808C20.5092 4.62482 20.2093 4.03734 20.2093 3.34669C20.2093 2.71773 20.5034 2.27321 20.959 2.0014M20.959 2.0014C22.5214 1.06931 25.9833 2.16823 25.9999 4.82512C26.0167 7.501 21.9655 9.61571 19.9039 7.72491C19.5537 7.40377 19.2779 7.03072 19.0775 6.6314M20.959 2.0014C18.7847 2.56063 18.1861 4.85569 19.0775 6.6314M20.959 2.0014C21.0174 1.98639 21.0769 1.97263 21.1375 1.96016C21.7375 1.83682 24.2301 2.61315 23.1042 3.50938C21.8061 4.54275 20.4308 5.57896 19.0775 6.6314M19.0775 6.6314C18.4947 7.08463 17.916 7.54087 17.3493 8.00119C12.9845 11.5466 7.06471 14.6898 3.87823 19.4062C3.40003 20.114 2.59492 20.5665 2.0571 21.2243C1.80287 21.5353 2.46221 21.3585 2.76675 21.3585C4.28703 21.3585 5.44751 21.988 6.7914 22.6651C10.9832 24.7769 15.1693 27.7405 19.5745 29.3375M19.5745 29.3375C19.6098 29.3503 19.6452 29.3631 19.6805 29.3757C21.3582 29.975 21.1591 30.5433 20.9209 28.8488C20.7998 27.9873 21.1262 27.2264 21.6599 26.7117M19.5745 29.3375C19.5891 31.1039 20.1403 33.4421 22.2145 32.8748C24.6076 32.2203 26.6771 29.509 25.0932 27.0713C24.1778 25.6625 22.5983 25.8065 21.6599 26.7117M19.5745 29.3375C19.5721 29.0459 19.5843 28.7699 19.6068 28.5252C19.6784 27.7424 20.6128 27.0377 21.6599 26.7117M21.6599 26.7117C23.0644 26.2744 24.6719 26.5186 24.6719 28.1707" stroke="#232F61" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className='font-bold'>Downloading...</p>
            </>
          ) : (
            <>
              <svg width="20" height="25" viewBox="0 0 28 35" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.5092 5.26808C20.5092 4.62482 20.2093 4.03734 20.2093 3.34669C20.2093 2.71773 20.5034 2.27321 20.959 2.0014M20.959 2.0014C22.5214 1.06931 25.9833 2.16823 25.9999 4.82512C26.0167 7.501 21.9655 9.61571 19.9039 7.72491C19.5537 7.40377 19.2779 7.03072 19.0775 6.6314M20.959 2.0014C18.7847 2.56063 18.1861 4.85569 19.0775 6.6314M20.959 2.0014C21.0174 1.98639 21.0769 1.97263 21.1375 1.96016C21.7375 1.83682 24.2301 2.61315 23.1042 3.50938C21.8061 4.54275 20.4308 5.57896 19.0775 6.6314M19.0775 6.6314C18.4947 7.08463 17.916 7.54087 17.3493 8.00119C12.9845 11.5466 7.06471 14.6898 3.87823 19.4062C3.40003 20.114 2.59492 20.5665 2.0571 21.2243C1.80287 21.5353 2.46221 21.3585 2.76675 21.3585C4.28703 21.3585 5.44751 21.988 6.7914 22.6651C10.9832 24.7769 15.1693 27.7405 19.5745 29.3375M19.5745 29.3375C19.6098 29.3503 19.6452 29.3631 19.6805 29.3757C21.3582 29.975 21.1591 30.5433 20.9209 28.8488C20.7998 27.9873 21.1262 27.2264 21.6599 26.7117M19.5745 29.3375C19.5891 31.1039 20.1403 33.4421 22.2145 32.8748C24.6076 32.2203 26.6771 29.509 25.0932 27.0713C24.1778 25.6625 22.5983 25.8065 21.6599 26.7117M19.5745 29.3375C19.5721 29.0459 19.5843 28.7699 19.6068 28.5252C19.6784 27.7424 20.6128 27.0377 21.6599 26.7117M21.6599 26.7117C23.0644 26.2744 24.6719 26.5186 24.6719 28.1707" stroke="#232F61" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className='font-semibold'>Share these results</p>
            </>
          )}
        </button>
      </div>
      <div className="p-4" ref={sectionRef} >
        {/* Overall Chat Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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
            <section className="p-4 border-2 border-neutral-800 rounded-lg bg-lime-50 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
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

        {/* AI Analysis - Personality Profiles*/}
        <div className="bg-emerald-50 px-6 rounded-lg shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] border-2 border-neutral-800  hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out mb-8">
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

        {/* Most Active Users and Conversation Starters in a Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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
                data={Object.entries(filterPhoneNumbers(results.most_active_users)).map(([user, percentage]) => ({
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
                data={Object.entries(filterPhoneNumbers(results.conversation_starters)).map(([user, percentage]) => ({
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