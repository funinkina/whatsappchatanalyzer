"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useRef } from "react"

export function WordCloud() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Sample data - in a real app, this would come from your analysis
    const words = [
      { text: "meeting", weight: 28 },
      { text: "tomorrow", weight: 24 },
      { text: "thanks", weight: 22 },
      { text: "please", weight: 20 },
      { text: "today", weight: 18 },
      { text: "lol", weight: 16 },
      { text: "weekend", weight: 15 },
      { text: "dinner", weight: 14 },
      { text: "time", weight: 13 },
      { text: "awesome", weight: 12 },
      { text: "cool", weight: 11 },
      { text: "party", weight: 10 },
      { text: "morning", weight: 9 },
      { text: "night", weight: 8 },
      { text: "friend", weight: 7 },
      { text: "coffee", weight: 6 },
      { text: "movie", weight: 5 },
      { text: "birthday", weight: 4 },
    ]

    const container = containerRef.current
    container.innerHTML = ""

    // Colors for the words
    const colors = [
      "#ec4899", // pink-500
      "#8b5cf6", // violet-500
      "#14b8a6", // teal-500
      "#f97316", // orange-500
      "#eab308", // yellow-500
    ]

    // Create and position words
    words.forEach((word) => {
      const fontSize = 14 + word.weight / 2
      const element = document.createElement("div")
      element.innerText = word.text
      element.style.position = "absolute"
      element.style.fontSize = `${fontSize}px`
      element.style.fontWeight = word.weight > 15 ? "bold" : "normal"
      element.style.color = colors[Math.floor(Math.random() * colors.length)]
      element.style.transform = `rotate(${Math.random() * 30 - 15}deg)`
      element.style.opacity = "0"
      element.style.transition = "opacity 0.5s ease"

      container.appendChild(element)

      // Position the word randomly but avoid overlaps (simplified approach)
      const left = Math.random() * (container.offsetWidth - element.offsetWidth)
      const top = Math.random() * (container.offsetHeight - element.offsetHeight)

      element.style.left = `${left}px`
      element.style.top = `${top}px`

      // Fade in the word
      setTimeout(() => {
        element.style.opacity = "1"
      }, Math.random() * 1000)
    })
  }, [])

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-bold">Word Cloud</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">Most frequently used words in the conversation</p>
        <div ref={containerRef} className="h-64 w-full relative"></div>
      </CardContent>
    </Card>
  )
}
