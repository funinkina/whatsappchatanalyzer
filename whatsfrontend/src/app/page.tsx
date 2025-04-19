"use client";

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setError(null); // Clear previous errors
    } else {
      setFile(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file); // Key 'file' must match backend expectation

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'An error occurred during upload.' }));
        throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
      }

      const resultData = await response.json();
      sessionStorage.setItem('analysisResults', JSON.stringify(resultData));
      router.push('/results');
    } catch (err: unknown) {
      console.error('Upload failed:', err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative">
      <div className='absolute top-0 left-0 w-full h-screen z-0'>
        {/* Floating Images */}
        <div className="absolute top-50 left-70 animate-float hover:-translate-x-20 hover:-translate-y-20 transition-transform duration-300" style={{ animationDelay: '0.3s' }}>
          <Image src="/floater_1.svg" alt="Floating Icon 1" width={250} height={250} style={{ height: "auto" }} />
        </div>
        <div className="absolute top-60 right-50 animate-float hover:translate-x-30 hover:-translate-y-30 transition-transform duration-300" style={{ animationDelay: '0.8s' }}>
          <Image src="/floater_2.svg" alt="Floating Icon 2" width={200} height={200} style={{ height: "auto" }} />
        </div>
        <div className="absolute bottom-10 left-4 animate-float hover:translate-x-50 hover:-translate-y-20 transition-transform duration-300" style={{ animationDelay: '1.4s' }}>
          <Image src="/floater_3.svg" alt="Floating Icon 3" width={400} height={400} style={{ height: "auto" }} />
        </div>
        <div className="absolute bottom-40 right-60 animate-float hover:translate-x-20 hover:translate-y-30 transition-transform duration-300" style={{ animationDelay: '1.9s' }}>
          <Image src="/floater_4.svg" alt="Floating Icon 4" width={300} height={300} style={{ height: "auto" }} />
        </div>
      </div>
      <div className='flex flex-col items-center justify-center p-4 h-screen z-10'>
        {/* Logo */}
        <div className="mb-10">
          <Image
            src="/bloop_logo.svg"
            alt="Your Company Logo"
            width={500}
            height={100}
            priority
            draggable="false"
          />
        </div>
        <div className='w-lg'>
          <p className="text-blue-950/90 text-5xl font-normal text-center mb-16">
            Over-analyze <Image src="/icons/smiley.svg" alt="Smiley" width={40} height={40} className="inline" /> and Nit-pick your <Image src="/icons/whatsapp.svg" alt="whatsapp icon" width={50} height={50} className="inline" /> Whatsapp <Image src="/icons/Quote.svg" alt="Quote" width={40} height={40} className="inline" /> Chats with <Image src="/bloop_logo.svg" alt="Your Company Logo" width={150} height={50} className='inline mb-2'></Image>
          </p>
        </div>
        {/* File Upload Box */}
        <div className="w-md relative bg-green-200 rounded-md outline-2 outline-neutral-800 p-4 shadow-[7px_7px_0px_0px_rgba(0,0,0,0.85)]">
          <div className='flex flex-row items-center justify-start mb-4 text-emerald-800 pr-20'>
            <Image
              src="/icons/upload_icon.svg"
              alt="Upload Icon"
              width={100}
              height={100}
              className="mr-4"
            />
            <div>
              <h2 className="text-2xl font-semibold">Upload the Chat</h2>
              <p className='text-sm font-light'>We never store any file, everything is cleared after processing</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 sr-only">
                Choose file
              </label>
              <div className="relative">
                <input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  onChange={handleFileChange}
                  className="sr-only"
                  accept=".txt,.zip"
                />
                <label
                  htmlFor="file-upload"
                  className={`flex flex-col items-center justify-center w-full p-3 rounded-md cursor-pointer
                ${file
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-gray-300 border-2 border-dashed border-amber-50'
                    } transition duration-150 ease-in-out`}
                >
                  <Image
                    src="/icons/white_upload.svg"
                    alt="Upload Icon"
                    width={40}
                    height={40}
                    className="mb-2"
                  />
                  <span className="text-sm font-medium">
                    {file ? 'File Selected' : 'Upload File (. txt or .zip)'}
                  </span>
                </label>
              </div>
              {file && <p className="mt-2 text-xs text-gray-600">Selected: {file.name}</p>}
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={isLoading || !file}
              className={`w-full px-4 py-2 text-blue-950 font-medium rounded-md outline-2 outline-neutral-800 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]
                ${isLoading || !file
                  ? 'bg-amber-50 cursor-not-allowed'
                  : 'bg-amber-50 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,0.85)] hover:cursor-pointer'
                } transition duration-150 ease-in-out flex items-center justify-center`}
            >
              {isLoading ? 'Uploading...' : (
                <>
                  <span className="mr-2">{'Analyze'}</span>
                  <Image
                    src="/icons/right_arrow.svg"
                    alt="Bloop Icon"
                    width={30}
                    height={30}
                  />
                </>
              )}
            </button>
          </form>
        </div>
        <div className='flex justify-center mt-20'>
          <Image
            src="/icons/down_arrow.svg"
            alt="Bloop Logo"
            width={50}
            height={100}
            className='animate-bounce'
            style={{ height: "auto" }}
          />
        </div>
      </div>

      {/* how to section */}
      <div className='mb-10 mt-10'>
        <div className='border-2 border-neutral-800'>
          <h1 className='text-center text-6xl font-bold my-5 text-blue-950'>How to get the chat file?</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {/* Step 1 */}
          <div className="bg-green-100 pt-4 flex flex-col justify-between items-center border-r-2 border-r-neutral-800">
            <div className='flex items-center justify-center h-full'>
              <Image src="/step_1.png" alt="Step 1" width={150} height={50} className="rounded-md shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]" />
            </div>
            <div className="text-lg text-gray-800 mt-10 text-left bg-amber-50 w-full h-24 flex items-center justify-center p-10 border-y-2 border-neutral-800">
              <h1 className='text-4xl font-extrabold mr-4'>1.</h1>
              <p>Open a chat, click on the <strong>Three Dots</strong> and click on <strong>More</strong>.</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-pink-100 pt-4 flex flex-col justify-between items-center border-r-2 border-r-neutral-800">
            <div className='flex items-center justify-center h-full'>
              <Image src="/step_2.png" alt="Step 2" width={150} height={200} className="rounded-md shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]" />
            </div>
            <div className="text-lg text-gray-800 mt-10 text-center bg-amber-50 w-full h-24 flex items-center justify-center p-10 border-y-2 border-neutral-800">
              <h1 className='text-4xl font-extrabold mr-4'>2.</h1>
              <p>Click on <strong>Export Chat</strong>.</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-purple-100 pt-4 flex flex-col justify-between items-center border-r-2 border-r-neutral-800">
            <div className='flex items-center justify-center h-full'>
              <Image src="/step_3.png" alt="Step 3" width={300} height={200} className="rounded-3xl shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]" />
            </div>
            <div className="text-lg text-gray-800 mt-10 text-center bg-amber-50 w-full h-24 flex items-center justify-center p-10 border-y-2 border-neutral-800">
              <h1 className='text-4xl font-extrabold mr-4'>3.</h1>
              <p>Choose <strong>Without Media</strong>.</p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-blue-100 pt-4 flex flex-col justify-between items-center">
            <div className='flex items-center justify-center h-full'>
              <Image src="/step_4.png" alt="Step 4" width={400} height={200} className="rounded-md shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]" />
            </div>
            <div className="text-lg text-gray-800 mt-10 text-center bg-amber-50 w-full h-24 flex items-center justify-center p-10 border-y-2 border-neutral-800">
              <h1 className='text-4xl font-extrabold mr-4'>4.</h1>
              <p>Save the file to your device for uploading.</p>
            </div>
          </div>
        </div>
      </div>

      {/* listing features */}
      <div className='flex flex-col items-center justify-center p-4 mb-20'>
        <h1 className='text-center text-6xl font-bold my-20 text-blue-950'>What you will get?</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {/* Feature 1 */}
          <div className="w-80 h-80 bg-rose-50 text-red-600 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-6 flex flex-col items-start">
            <Image src="/icons/prize.svg" alt="Active Member" width={50} height={50} className="mb-4" />
            <h2 className="text-3xl font-semibold text-start">Most active member and conversation starter</h2>
          </div>

          {/* Feature 2 */}
          <div className="w-80 h-80 bg-sky-50 text-sky-700 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-6 flex flex-col items-start">
            <Image src="/icons/frown.svg" alt="Ignored" width={80} height={80} className="mb-4" />
            <h2 className="text-3xl font-semibold text-start">Who is the most ignored one?</h2>
          </div>

          {/* Feature 3 */}
          <div className="w-80 h-80 bg-red-100 text-orange-700 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-6 flex flex-col items-start">
            <Image src="/icons/time.svg" alt="Average Reply Time" width={50} height={50} className="mb-4" />
            <h2 className="text-3xl font-semibold text-start">How long does it take on average to get a reply?</h2>
          </div>

          {/* Feature 4 */}
          <div className="w-80 h-80 bg-purple-100 text-violet-800 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-6 flex flex-col items-start">
            <Image src="/icons/chat.svg" alt="Words and Emojis" width={80} height={80} className="mb-4" />
            <h2 className="text-3xl font-semibold text-start">Most commonly used words and emojis.</h2>
          </div>

          {/* Feature 5 */}
          <div className="w-80 h-80 bg-rose-50 text-red-700 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-6 flex flex-col items-start">
            <Image src="/icons/graph.svg" alt="Trends" width={80} height={80} className="mb-4" />
            <h2 className="text-3xl font-semibold text-start">Trends and activity over the past year.</h2>
          </div>

          {/* Feature 6 */}
          <div className="w-80 h-80 bg-emerald-100 text-emerald-700 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-6 flex flex-col items-start">
            <Image src="/icons/sparkle.svg" alt="AI Analysis" width={60} height={60} className="mb-4" />
            <h2 className="text-3xl font-semibold text-start">AI powered analysis and charcter assingning.</h2>
          </div>
        </div>
      </div>
    </main>
  );
}