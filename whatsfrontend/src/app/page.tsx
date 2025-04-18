// src/app/page.tsx
"use client"; // Required for using hooks like useState, useRouter

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router
import { DM_Sans } from 'next/font/google';

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
        // Try to get error message from backend response body
        const errorData = await response.json().catch(() => ({ message: 'An error occurred during upload.' }));
        throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
      }

      const resultData = await response.json();

      // Store results temporarily (e.g., sessionStorage) to pass to the next page
      // Using sessionStorage is simple but has size limits.
      // For larger data, consider state management (Context, Zustand) or other strategies.
      sessionStorage.setItem('analysisResults', JSON.stringify(resultData));

      // Navigate to the results page
      router.push('/results');

    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-10">
        <Image
          src="/bloop_logo.svg" // Make sure logo.png is in public folder
          alt="Your Company Logo"
          width={500} // Adjust width as needed
          height={100} // Adjust height as needed
          priority // Load logo quickly
        />
      </div>

      <div>
        <p className="text-blue-950/90 text-4xl font-normal text-center mb-16 w-3/4">
          Over-analyze and Nit-pick your Whatsapp Chats with Bloop
        </p>
      </div>

      {/* File Upload Box */}
      <div className="w-96 h-56 relative bg-green-200 rounded-md outline-2 outline-neutral-800 p-4 ">
        <div className='flex flex-row items-center justify-center mb-4 '>
          <Image
            src="/icons/upload_icon.svg" // Make sure upload_icon.svg is in public folder
            alt="Upload Icon"
            width={50} // Adjust width as needed
            height={50} // Adjust height as needed
            className="absolute top-4 left-4" // Positioning the icon
          />
          <h2 className="text-2xl font-bold text-center text-gray-800">Upload the Chat</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 sr-only">
              Choose file
            </label>
            <input
              id="file-upload"
              name="file-upload"
              type="file"
              onChange={handleFileChange}
              className={`block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100 ${!file ? 'border border-dashed border-gray-300 p-2 rounded-md' : ''}`
              }
              accept=".txt,.pdf,.docx" // Optional: Specify acceptable file types
            />
            {file && <p className="mt-2 text-xs text-gray-600">Selected: {file.name}</p>}
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !file}
            className={`w-full px-4 py-2 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              ${isLoading || !file
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
              } transition duration-150 ease-in-out`}
          >
            {isLoading ? 'Uploading...' : 'Upload and Analyze'}
          </button>
        </form>
      </div>
    </main>
  );
}