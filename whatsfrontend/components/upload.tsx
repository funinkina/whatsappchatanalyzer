"use client"

import type React from "react"

import { useState } from "react"
import { UploadIcon, FileText, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useRouter } from "next/navigation"

export function Upload() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    setError(null)

    if (selectedFile) {
      if (selectedFile.name.endsWith(".txt")) {
        setFile(selectedFile)
      } else {
        setError("Please upload a WhatsApp text file (.txt)")
        setFile(null)
      }
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setUploadProgress(0)

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 5
      })
    }, 100)

    try {
      // Simulate file processing
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // In a real app, you would send the file to your API here
      // const formData = new FormData();
      // formData.append('chatFile', file);
      // const response = await fetch('/api/analyze', { method: 'POST', body: formData });

      clearInterval(interval)
      setUploadProgress(100)

      // Simulate successful upload and redirect
      setTimeout(() => {
        router.push("/dashboard")
      }, 1000)
    } catch (err) {
      clearInterval(interval)
      setError("Failed to upload file. Please try again.")
      setUploading(false)
    }
  }

  return (
    <section id="upload-section" className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="border-2 border-dashed border-pink-200 bg-white/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Upload Your Chat</h2>
              <p className="text-gray-600">Export your WhatsApp chat and upload the text file to analyze</p>
            </div>

            <div
              className={`
                relative border-2 rounded-xl p-10 text-center transition-all
                ${file ? "border-green-300 bg-green-50" : "border-pink-200 bg-pink-50/50 hover:bg-pink-50"}
                ${error ? "border-red-300 bg-red-50" : ""}
              `}
            >
              <input
                type="file"
                id="file-upload"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileChange}
                accept=".txt"
                disabled={uploading}
              />

              <div className="flex flex-col items-center justify-center gap-3">
                {file ? (
                  <>
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-gray-600" />
                      <span className="font-medium text-gray-800">{file.name}</span>
                    </div>
                    <p className="text-sm text-gray-500">File selected. Click upload to continue.</p>
                  </>
                ) : error ? (
                  <>
                    <AlertCircle className="h-12 w-12 text-red-500" />
                    <p className="text-red-600 font-medium">{error}</p>
                    <p className="text-sm text-gray-500">Please select a valid WhatsApp text file.</p>
                  </>
                ) : (
                  <>
                    <UploadIcon className="h-12 w-12 text-pink-500" />
                    <p className="font-medium text-gray-800">Drag & drop your WhatsApp chat file here</p>
                    <p className="text-sm text-gray-500">or click to browse files</p>
                  </>
                )}
              </div>
            </div>

            {file && (
              <div className="mt-6">
                {uploading && (
                  <div className="mb-4">
                    <Progress value={uploadProgress} className="h-2 bg-pink-100" />
                    <p className="text-sm text-gray-500 mt-2">
                      {uploadProgress < 100 ? "Uploading..." : "Processing your chat data..."}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white py-6"
                >
                  {uploading ? "Processing..." : "Analyze Chat"}
                </Button>
              </div>
            )}

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                Your data is processed securely. We don't store your chat messages.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
