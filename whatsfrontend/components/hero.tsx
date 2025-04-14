"use client"

import { ArrowDown } from "lucide-react"

export function Hero() {
  return (
    <section className="relative py-20 px-4 text-center">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-teal-500 text-transparent bg-clip-text mb-6">
          WhatsApp Chat Analyzer
        </h1>
        <p className="text-xl md:text-2xl text-gray-700 mb-8">
          Upload your WhatsApp chat and discover fascinating insights about your conversations
        </p>
        <div className="flex justify-center">
          <button
            onClick={() => {
              const uploadSection = document.getElementById("upload-section")
              uploadSection?.scrollIntoView({ behavior: "smooth" })
            }}
            className="animate-bounce rounded-full p-3 bg-white shadow-lg hover:shadow-xl transition-all"
          >
            <ArrowDown className="h-6 w-6 text-pink-500" />
          </button>
        </div>
      </div>

      {/* Decorative elements for maximalist design */}
      <div className="absolute top-20 left-10 w-20 h-20 rounded-full bg-pink-300 opacity-20 blur-xl"></div>
      <div className="absolute bottom-10 right-20 w-32 h-32 rounded-full bg-purple-300 opacity-20 blur-xl"></div>
      <div className="absolute top-40 right-10 w-16 h-16 rounded-full bg-teal-300 opacity-20 blur-xl"></div>
    </section>
  )
}
