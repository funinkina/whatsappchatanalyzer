"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useRef } from "react"

export function ParticipantActivity() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    // Sample data - in a real app, this would come from your analysis
    const participants = [
      { name: "Alex", messages: 3245, color: "#ec4899" }, // pink-500
      { name: "Taylor", messages: 2890, color: "#8b5cf6" }, // violet-500
      { name: "Jordan", messages: 2150, color: "#14b8a6" }, // teal-500
      { name: "Casey", messages: 1980, color: "#f97316" }, // orange-500
      { name: "Riley", messages: 1540, color: "#eab308" }, // yellow-500
    ]

    // Sort participants by message count (descending)
    participants.sort((a, b) => b.messages - a.messages)

    // Chart dimensions
    const padding = 60
    const chartWidth = canvas.width - padding * 2
    const chartHeight = canvas.height - padding * 2
    const barHeight = (chartHeight / participants.length) * 0.6
    const barSpacing = (chartHeight / participants.length) * 0.4

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Calculate max value for scaling
    const maxValue = Math.max(...participants.map((p) => p.messages)) * 1.1

    // Draw bars
    participants.forEach((participant, index) => {
      const barWidth = (participant.messages / maxValue) * chartWidth
      const y = padding + index * (barHeight + barSpacing)

      // Draw bar
      ctx.beginPath()
      ctx.roundRect(padding, y, barWidth, barHeight, 8)
      ctx.fillStyle = participant.color
      ctx.fill()

      // Draw participant name
      ctx.fillStyle = "#374151" // text-gray-700
      ctx.textAlign = "right"
      ctx.font = "bold 14px sans-serif"
      ctx.fillText(participant.name, padding - 10, y + barHeight / 2 + 5)

      // Draw message count
      ctx.fillStyle = "#6b7280" // text-gray-500
      ctx.textAlign = "left"
      ctx.font = "14px sans-serif"
      ctx.fillText(participant.messages.toString(), padding + barWidth + 10, y + barHeight / 2 + 5)
    })
  }, [])

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-bold">Participant Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">Total messages sent by each participant</p>
        <div className="h-80 w-full">
          <canvas ref={canvasRef} className="w-full h-full"></canvas>
        </div>
      </CardContent>
    </Card>
  )
}
