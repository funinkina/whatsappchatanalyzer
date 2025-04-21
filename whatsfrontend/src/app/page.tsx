"use client";

import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip'; // Import JSZip

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const processFile = async (selectedFile: File) => {
    setError(null);
    setFile(null);
    setIsLoading(true);

    try {
      if (selectedFile.type === "text/plain") {
        setFile(selectedFile);
      } else if (selectedFile.name.endsWith(".zip")) {
        const zip = new JSZip();
        const contents = await zip.loadAsync(selectedFile);
        let txtFileEntry: JSZip.JSZipObject | null = null;
        let txtFileName: string | null = null;

        // Find the first .txt file in the zip
        for (const filename in contents.files) {
          if (filename.endsWith(".txt") && !contents.files[filename].dir) {
            if (!filename.startsWith('__MACOSX/') && !filename.startsWith('.')) {
              if (txtFileEntry) {
                throw new Error("Multiple .txt files found in zip. Please provide a zip with only one chat file.");
              }
              txtFileEntry = contents.files[filename];
              txtFileName = filename.split('/').pop() || filename;
            }
          }
        }

        if (txtFileEntry && txtFileName) {
          const fileContent = await txtFileEntry.async("blob");
          const extractedFile = new File([fileContent], txtFileName, { type: "text/plain" });
          setFile(extractedFile);
          console.log(`Extracted ${txtFileName} from zip.`);
        } else {
          throw new Error("No .txt file found in the zip archive.");
        }
      } else {
        throw new Error("Only .txt or .zip files are allowed.");
      }
    } catch (err: unknown) {
      console.error("File processing error:", err);
      const message = err instanceof Error ? err.message : "An error occurred while processing the file.";
      setError(message);
      setFile(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      processFile(event.target.files[0]);
    } else {
      setFile(null);
      setError(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      processFile(event.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError('Please select a file first.');
      return;
    }

    if (file.type !== "text/plain") {
      setError("An internal error occurred: file is not plain text.");
      console.error("Submit error: File state is not text/plain", file);
      setFile(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file, file.name);

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
    <main className="relative overflow-x-hidden">
      {/* open source github button */}
      <a href="https://github.com/funinkina/whatsappchatanalyzer/" target="_blank" rel="noopener noreferrer">
        <div className='absolute h-fit w-fit top-6 rounded-full px-4 py-2 gap-4 left-1/2 transform -translate-x-1/2 flex justify-center items-center z-20 bg-black/90 text-amber-50 blueh-fit overflow-hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 shadow hover:bg-black/90 whitespace-pre md:flex group transition-all duration-300 ease-out hover:ring-2 hover:ring-blue-950 hover:ring-offset-2'>
          <span
            className="absolute right-0 -mt-12 h-32 w-8 blur-lg translate-x-12 rotate-12 bg-white opacity-20 transition-all duration-500 ease-out group-hover:-translate-x-50 md:group-hover:-translate-x-50"
          ></span>
          <svg className="w-5 h-5 fill-amber-50" viewBox="0 0 438.549 438.549">
            <path
              d="M409.132 114.573c-19.608-33.596-46.205-60.194-79.798-79.8-33.598-19.607-70.277-29.408-110.063-29.408-39.781 0-76.472 9.804-110.063 29.408-33.596 19.605-60.192 46.204-79.8 79.8C9.803 148.168 0 184.854 0 224.63c0 47.78 13.94 90.745 41.827 128.906 27.884 38.164 63.906 64.572 108.063 79.227 5.14.954 8.945.283 11.419-1.996 2.475-2.282 3.711-5.14 3.711-8.562 0-.571-.049-5.708-.144-15.417a2549.81 2549.81 0 01-.144-25.406l-6.567 1.136c-4.187.767-9.469 1.092-15.846 1-6.374-.089-12.991-.757-19.842-1.999-6.854-1.231-13.229-4.086-19.13-8.559-5.898-4.473-10.085-10.328-12.56-17.556l-2.855-6.57c-1.903-4.374-4.899-9.233-8.992-14.559-4.093-5.331-8.232-8.945-12.419-10.848l-1.999-1.431c-1.332-.951-2.568-2.098-3.711-3.429-1.142-1.331-1.997-2.663-2.568-3.997-.572-1.335-.098-2.43 1.427-3.289 1.525-.859 4.281-1.276 8.28-1.276l5.708.853c3.807.763 8.516 3.042 14.133 6.851 5.614 3.806 10.229 8.754 13.846 14.842 4.38 7.806 9.657 13.754 15.846 17.847 6.184 4.093 12.419 6.136 18.699 6.136 6.28 0 11.704-.476 16.274-1.423 4.565-.952 8.848-2.383 12.847-4.285 1.713-12.758 6.377-22.559 13.988-29.41-10.848-1.14-20.601-2.857-29.264-5.14-8.658-2.286-17.605-5.996-26.835-11.14-9.235-5.137-16.896-11.516-22.985-19.126-6.09-7.614-11.088-17.61-14.987-29.979-3.901-12.374-5.852-26.648-5.852-42.826 0-23.035 7.52-42.637 22.557-58.817-7.044-17.318-6.379-36.732 1.997-58.24 5.52-1.715 13.706-.428 24.554 3.853 10.85 4.283 18.794 7.952 23.84 10.994 5.046 3.041 9.089 5.618 12.135 7.708 17.705-4.947 35.976-7.421 54.818-7.421s37.117 2.474 54.823 7.421l10.849-6.849c7.419-4.57 16.18-8.758 26.262-12.565 10.088-3.805 17.802-4.853 23.134-3.138 8.562 21.509 9.325 40.922 2.279 58.24 15.036 16.18 22.559 35.787 22.559 58.817 0 16.178-1.958 30.497-5.853 42.966-3.9 12.471-8.941 22.457-15.125 29.979-6.191 7.521-13.901 13.85-23.131 18.986-9.232 5.14-18.182 8.85-26.84 11.136-8.662 2.286-18.415 4.004-29.263 5.146 9.894 8.562 14.842 22.077 14.842 40.539v60.237c0 3.422 1.19 6.279 3.572 8.562 2.379 2.279 6.136 2.95 11.276 1.995 44.163-14.653 80.185-41.062 108.068-79.226 27.88-38.161 41.825-81.126 41.825-128.906-.01-39.771-9.818-76.454-29.414-110.049z"
            ></path>
          </svg>
          <p className='text-md'>Open sauce by 🤍</p>
        </div>
      </a>

      <div className='absolute top-0 left-0 w-full h-screen z-0 hidden md:block pointer-events-none'>
        <div className="absolute top-[15%] left-[5%] animate-float hover:-translate-x-10 hover:-translate-y-10 transition-transform duration-300" style={{ animationDelay: '0.3s' }}>
          <Image src="/floater_1.svg" alt="Floating Icon 1" width={150} height={150} className="lg:w-[250px] lg:h-[250px] h-auto" />
        </div>
        <div className="absolute top-[25%] right-[8%] animate-float hover:translate-x-10 hover:-translate-y-10 transition-transform duration-300" style={{ animationDelay: '0.8s' }}>
          <Image src="/floater_2.svg" alt="Floating Icon 2" width={120} height={120} className="lg:w-[200px] lg:h-[200px] h-auto" />
        </div>
        <div className="absolute bottom-[10%] left-[2%] animate-float hover:translate-x-15 hover:-translate-y-10 transition-transform duration-300" style={{ animationDelay: '1.4s' }}>
          <Image src="/floater_3.svg" alt="Floating Icon 3" width={250} height={250} className="lg:w-[400px] lg:h-[400px] h-auto" />
        </div>
        <div className="absolute bottom-[15%] right-[5%] animate-float hover:translate-x-10 hover:translate-y-10 transition-transform duration-300" style={{ animationDelay: '1.9s' }}>
          <Image src="/floater_4.svg" alt="Floating Icon 4" width={180} height={180} className="lg:w-[300px] lg:h-[300px] h-auto" />
        </div>
      </div>

      {/* Hero Section */}
      <div className='relative flex flex-col items-center justify-center p-4 sm:p-8 md:p-12 min-h-screen z-10'>
        {/* Logo */}
        <div className="mb-8 md:mb-10 w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl sm:mt-10 mt-4">
          <Image
            src="/bloop_logo.svg"
            alt="Your Company Logo"
            width={500}
            height={100}
            className="w-full h-auto"
            priority
            draggable="false"
          />
        </div>

        {/* Tagline */}
        <div className='w-full max-w-md md:max-w-2xl lg:max-w-3xl'>
          <p className="text-blue-950/90 text-3xl sm:text-4xl lg:text-5xl font-medium text-center mb-10 md:mb-16">
            over-analyze <Image src="/icons/smiley.svg" alt="Smiley" width={30} height={30} className="inline w-8 h-8 lg:w-10 lg:h-10" /> and nit-pick your <Image src="/icons/whatsapp.svg" alt="whatsapp icon" width={40} height={40} className="inline w-10 h-10 lg:w-12 lg:h-12" /> Whatsapp <Image src="/icons/Quote.svg" alt="Quote" width={30} height={30} className="inline w-8 h-8 lg:w-10 lg:h-10" /> chats with <Image src="/bloop_logo.svg" alt="Your Company Logo" width={100} height={33} className='inline mb-1 lg:mb-2 w-[100px] lg:w-[150px] h-auto'></Image>
          </p>
        </div>

        {/* File Upload Box */}
        <div
          className="w-full max-w-md lg:max-w-lg relative bg-green-200 rounded-md outline-2 outline-neutral-800 p-4 shadow-[7px_7px_0px_0px_rgba(0,0,0,0.85)]"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className='flex flex-col sm:flex-row items-center justify-start mb-4 text-emerald-800'>
            <Image
              src="/icons/upload_icon.svg"
              alt="Upload Icon"
              width={60}
              height={60}
              className="mr-0 sm:mr-4 mb-2 sm:mb-0 w-16 h-16 md:w-20 md:h-20"
            />
            <div>
              <h2 className="text-xl md:text-2xl font-semibold text-center sm:text-left">upload the chat</h2>
              <p className='text-xs md:text-sm font-light text-center sm:text-left'>dw, we never store any file, so we don&apos;t snoop through your chats</p>
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
                  disabled={isLoading}
                />
                <label
                  htmlFor="file-upload"
                  className={`flex flex-col items-center justify-center w-full p-3 rounded-md cursor-pointer
                ${isLoading ? 'bg-gray-400 cursor-wait' : file
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-amber-50'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-amber-50 border-2 border-dashed border-amber-50'
                    } transition duration-150 ease-in-out`}
                >
                  <Image
                    src="/icons/white_upload.svg"
                    alt="Upload Icon"
                    width={30}
                    height={30}
                    className="mb-2 w-8 h-8 md:w-10 md:h-10"
                  />
                  <span className="text-xs sm:text-sm font-medium text-center"> {/* Centered text */}
                    {isLoading ? 'Processing...' : file ? `Selected: ${file.name}` : <span className="underline">drag & drop or upload file (.txt or .zip)</span>}
                  </span>
                </label>
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={isLoading || !file}
              className={`w-full px-4 py-2 text-blue-950 font-medium rounded-md outline-2 outline-neutral-800 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)]
                ${isLoading || !file
                  ? 'bg-amber-50 cursor-not-allowed opacity-70' // Added opacity
                  : 'bg-amber-50 hover:shadow-[7px_7px_0px_0px_rgba(0,0,0,0.85)] hover:cursor-pointer'
                } transition duration-150 ease-in-out flex items-center justify-center text-sm sm:text-base`}
            >
              {isLoading && !file ? 'Processing...' : isLoading && file ? 'Uploading...' : (
                <>
                  <span className="mr-2">{'discover yo secrets'}</span>
                  <Image
                    src="/icons/right_arrow.svg"
                    alt="Arrow Icon"
                    width={24}
                    height={24}
                    className='w-5 h-5 sm:w-6 sm:h-6'
                  />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Down Arrow */}
        <div className='flex justify-center mt-16 mb-8 sm:mt-20 sm:mb-12 md:mt-24 md:mb-16'>
          <Image
            src="/icons/down_arrow.svg"
            alt="Scroll down arrow"
            width={40}
            height={80}
            className='animate-bounce w-10 h-auto sm:w-12'
          />
        </div>
      </div>

      {/* How To Section */}
      <div className='mb-16 md:mb-20'>
        <div className='border-y-2 border-neutral-800 py-4 md:py-5'>
          <h1 className='text-center text-4xl sm:text-5xl lg:text-6xl font-bold text-blue-950 px-4'>
            dunno how to get the chat file?
          </h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-b-2 border-neutral-800 md:border-b-0">
          {/* Step 1 */}
          <div className="bg-green-100 pt-4 flex flex-col justify-between items-center border-b-2 md:border-b-0 md:border-r-2 border-neutral-800">
            <div className='flex items-center justify-center h-full p-4'>
              <Image src="/step_1.png" alt="Step 1: Open chat menu" width={150} height={50} className="rounded-md shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] max-w-[120px] sm:max-w-[150px] w-full h-auto" />
            </div>

            <div className="text-base md:text-lg text-gray-800 text-left bg-amber-50 w-full flex items-center justify-center p-4 sm:p-6 md:min-h-[8rem] border-y-2 border-neutral-800">
              <h1 className='text-3xl md:text-4xl font-extrabold mr-3 md:mr-4'>1.</h1>
              <p>open a chat, tap the <strong>three dots</strong> and tap on <strong>More</strong>.</p> {/* Use tap for mobile context */}
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-pink-100 pt-4 flex flex-col justify-between items-center border-b-2 md:border-b-0 lg:border-r-2 border-neutral-800">
            <div className='flex items-center justify-center h-full p-4'>
              <Image src="/step_2.png" alt="Step 2: Tap Export Chat" width={200} height={200} className="rounded-md shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] max-w-[180px] sm:max-w-[200px] w-full h-auto" />
            </div>
            <div className="text-base md:text-lg text-gray-800 text-center bg-amber-50 w-full flex items-center justify-center p-4 sm:p-6 md:min-h-[8rem] border-y-2 border-neutral-800">
              <h1 className='text-3xl md:text-4xl font-extrabold mr-3 md:mr-4'>2.</h1>
              <p>tap on <strong>Export Chat</strong>.</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-purple-100 pt-4 flex flex-col justify-between items-center border-b-2 md:border-b-0 md:border-r-2 border-neutral-800">
            <div className='flex items-center justify-center h-full p-4'>
              <Image src="/step_3.png" alt="Step 3: Choose Without Media" width={400} height={200} className="rounded-3xl shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] max-w-[280px] sm:max-w-[350px] lg:max-w-[400px] w-full h-auto" />
            </div>
            <div className="text-base md:text-lg text-gray-800 text-center bg-amber-50 w-full flex items-center justify-center p-4 sm:p-6 md:min-h-[8rem] border-y-2 border-neutral-800">
              <h1 className='text-3xl md:text-4xl font-extrabold mr-3 md:mr-4'>3.</h1>
              <p>choose <strong>Without Media</strong>.</p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-blue-100 pt-4 flex flex-col justify-between items-center">
            <div className='flex items-center justify-center h-full p-4'>
              <Image src="/step_4.png" alt="Step 4: Save the file" width={400} height={200} className="rounded-md shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] max-w-[280px] sm:max-w-[350px] lg:max-w-[400px] w-full h-auto" />
            </div>
            <div className="text-base md:text-lg text-gray-800 text-center bg-amber-50 w-full flex items-center justify-center p-4 sm:p-6 md:min-h-[8rem] border-y-2 border-neutral-800">
              <h1 className='text-3xl md:text-4xl font-extrabold mr-3 md:mr-4'>4.</h1>
              <p>save the file to your device for uploading. you also send the file to yourself on whatsapp and save manually from there.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Listing Features Section */}
      <div className='flex flex-col items-center justify-center p-4 mb-20'>
        <h1 className='text-center text-4xl sm:text-5xl lg:text-6xl font-bold my-12 md:my-20 text-blue-950 px-4'>
          what are you in for?
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10 w-full max-w-sm sm:max-w-none sm:px-8 lg:px-0 lg:max-w-6xl">
          {/* Feature 1 */}
          <div className="w-full h-64 bg-rose-50 text-red-600 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-4 sm:p-6 flex flex-col items-start justify-between hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] md:hover:shadow-[15px_15px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <Image src="/icons/prize.svg" alt="Most Active" width={40} height={40} className="mb-4 w-10 h-10 sm:w-12 sm:h-12" />
            <h2 className="text-2xl sm:text-3xl font-semibold text-start">who yaps the most?</h2>
          </div>

          {/* Feature 2 */}
          <div className="w-full h-64 bg-sky-50 text-sky-700 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-4 sm:p-6 flex flex-col items-start justify-between hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] md:hover:shadow-[15px_15px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <Image src="/icons/frown.svg" alt="Most Ignored" width={60} height={60} className="mb-4 w-12 h-12 sm:w-16 sm:h-16" />
            <h2 className="text-2xl sm:text-3xl font-semibold text-start">who gets ignored the most?</h2>
          </div>

          {/* Feature 3 */}
          <div className="w-full h-64 bg-red-100 text-orange-700 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-4 sm:p-6 flex flex-col items-start justify-between hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] md:hover:shadow-[15px_15px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <Image src="/icons/time.svg" alt="Reply Time" width={40} height={40} className="mb-4 w-10 h-10 sm:w-12 sm:h-12" />
            <h2 className="text-2xl sm:text-3xl font-semibold text-start">how long do they ghost you?</h2>
          </div>

          {/* Feature 4 */}
          <div className="w-full h-64 bg-purple-100 text-violet-800 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-4 sm:p-6 flex flex-col items-start justify-between hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] md:hover:shadow-[15px_15px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <Image src="/icons/chat.svg" alt="Word Usage" width={60} height={60} className="mb-4 w-12 h-12 sm:w-16 sm:h-16" />
            <h2 className="text-2xl sm:text-3xl font-semibold text-start">which words & emojis do yall use most?</h2> {/* Added & */}
          </div>

          {/* Feature 5 */}
          <div className="w-full h-64 bg-rose-50 text-red-700 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-4 sm:p-6 flex flex-col items-start justify-between hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] md:hover:shadow-[15px_15px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <Image src="/icons/graph.svg" alt="Chat Trends" width={60} height={60} className="mb-4 w-12 h-12 sm:w-16 sm:h-16" />
            <h2 className="text-2xl sm:text-3xl font-semibold text-start">your yapping highs and lows over time</h2> {/* Simplified */}
          </div>

          {/* Feature 6 */}
          <div className="w-full h-64 bg-emerald-100 text-emerald-700 rounded-lg border-2 border-neutral-800 shadow-[5px_5px_0px_0px_rgba(0,0,0,0.85)] p-4 sm:p-6 flex flex-col items-start justify-between hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,0.85)] md:hover:shadow-[15px_15px_0px_0px_rgba(0,0,0,0.85)] transition duration-150 ease-in-out">
            <Image src="/icons/sparkle.svg" alt="AI Insights" width={50} height={50} className="mb-4 w-10 h-10 sm:w-12 sm:h-12" />
            <h2 className="text-2xl sm:text-3xl font-semibold text-start">what do your chats tell about you?</h2>
          </div>
        </div>
      </div>
    </main>
  );
}