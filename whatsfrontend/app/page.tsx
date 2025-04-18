'use client'; // This component needs to be a Client Component for state and interaction

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router
import Image from 'next/image';
import styles from '../styles/Home.module.css'; // Import CSS Module

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter(); // Hook for navigation

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null); // Clear previous errors
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    } else {
      setFile(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file); // 'file' is the key the backend expects

    try {
      // Send the file to our Next.js API route
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Try to get error message from backend response
        let errorMessage = `Error: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // Ignore if response is not JSON
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // *** Store data for the next page ***
      // Option 1: sessionStorage (simple for this case)
      sessionStorage.setItem('analysisData', JSON.stringify(data));

      // Option 2: If data is small, pass via query params (more complex encoding)
      // const encodedData = encodeURIComponent(JSON.stringify(data));
      // router.push(`/results?data=${encodedData}`);

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
    <main className={styles.container}>
      <Image
        src="/bloop_logo.png" // Assumes logo.png is in the public folder
        alt="App Logo"
        width={150} // Specify width
        height={50} // Specify height (adjust aspect ratio)
        className={styles.logo}
        priority // Load logo faster
      />

      <div className={styles.uploadBox}>
        <h2>Upload Your File</h2>
        <input
          type="file"
          onChange={handleFileChange}
          disabled={isLoading}
        // Optional: Add accept attribute for specific file types
        // accept=".txt,.csv,.pdf"
        />
        <button
          onClick={handleSubmit}
          disabled={!file || isLoading}
        >
          {isLoading ? 'Processing...' : 'Analyze File'}
        </button>

        {/* Display Loading or Error Messages */}
        {isLoading && <p className={`${styles.message} ${styles.loading}`}>Uploading and analyzing...</p>}
        {error && <p className={`${styles.message} ${styles.error}`}>{error}</p>}
      </div>
    </main>
  );
}