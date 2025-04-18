// src/app/page.tsx
"use client"; // Required for using hooks like useState, useRouter

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router
import { DM_Sans } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
});

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
    event.preventDefault(); // Prevent default form submission

    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file); // Key 'file' must match backend expectation

    try {
      const response = await fetch('/api/upload', { // Call our Next.js API route
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
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={`${dmSans.className} flex flex-col items-center justify-center p-4 h-screen`}>
      {/* Logo */}
      <div className="mb-10">
        <Image
          src="/bloop_logo.svg"
          alt="Your Company Logo"
          width={500}
          height={100}
          priority
        />
      </div>

      <div className='w-1/4'>
        <p className="text-blue-950/90 text-4xl font-normal text-center mb-16">
          Over-analyze <Image src="/icons/smiley.svg" alt="Smiley" width={40} height={40} className="inline" /> and Nit-pick your <Image src="/icons/whatsapp.svg" alt="whatsapp icon" width={50} height={50} className="inline" /> Whatsapp Chats with <Image src="/bloop_logo.svg" alt="Your Company Logo" width={100} height={10} className='inline mb-2'></Image>
        </p>
      </div>

      {/* File Upload Box */}
      <div className="w-96 relative bg-green-200 rounded-md outline-2 outline-neutral-800 p-4 shadow-[7px_7px_0px_0px_rgba(0,0,0,0.85)]">
        <div className='flex flex-row items-center justify-start mb-4 text-emerald-800'>
          <Image
            src="/icons/upload_icon.svg"
            alt="Upload Icon"
            width={80}
            height={80}
            className="mr-4"
          />
          <div>
            <h2 className="text-xl font-medium">Upload the Chat</h2>
            <p className='text-xs font-light'>We never store any file, everything is cleared after processing</p>
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
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-amber-50 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,0.85)] hover:cursor-pointer'
              } transition duration-150 ease-in-out flex items-center justify-center`}
          >
            {isLoading ? 'Uploading...' : (
              <>
                <span className="mr-2">{'Upload and Analyze'}</span>
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
    </main>
  );
}