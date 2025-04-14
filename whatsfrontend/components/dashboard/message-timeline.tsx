"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useRef } from "react"

export function MessageTimeline() {
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
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const data = [420, 380, 650, 700, 580, 750, 980, 1200, 900, 850, 780, 950]

    // Chart dimensions
    const padding = 40
    const chartWidth = canvas.width - padding * 2
    const chartHeight = canvas.height - padding * 2

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw gradient background for the line
    const gradient = ctx.createLinearGradient(0, padding, 0, chartHeight + padding)
    gradient.addColorStop(0, "rgba(236, 72, 153, 0.7)") // pink-500
    gradient.addColorStop(1, "rgba(236, 72, 153, 0)")

    // Calculate scales
    const maxValue = Math.max(...data) * 1.1
    const xStep = chartWidth / (data.length - 1)

    // Draw filled area
    ctx.beginPath()
    ctx.moveTo(padding, chartHeight + padding)

    data.forEach((value, index) => {
      const x = padding + index * xStep
      const y = padding + chartHeight - (value / maxValue) * chartHeight
      ctx.lineTo(x, y)
    })

    ctx.lineTo(padding + chartWidth, chartHeight + padding)
    ctx.lineTo(padding, chartHeight + padding)
    ctx.fillStyle = gradient
    ctx.fill()

    // Draw line
    ctx.beginPath()
    data.forEach((value, index) => {
      const x = padding + index * xStep
      const y = padding + chartHeight - (value / maxValue) * chartHeight

      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })

    ctx.strokeStyle = "rgb(236, 72, 153)"
    ctx.lineWidth = 3
    ctx.stroke()

    // Draw points
    data.forEach((value, index) => {
      const x = padding + index * xStep
      const y = padding + chartHeight - (value / maxValue) * chartHeight

      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fillStyle = "white"
      ctx.fill()
      ctx.strokeStyle = "rgb(236, 72, 153)"
      ctx.lineWidth = 3
      ctx.stroke()
    })

    // Draw x-axis labels
    ctx.textAlign = "center"
    ctx.fillStyle = "#6b7280" // text-gray-500
    ctx.font = "12px sans-serif"

    months.forEach((month, index) => {
      const x = padding + index * xStep
      ctx.fillText(month, x, canvas.height - 15)
    })

    // Draw y-axis labels
    ctx.textAlign = "right"
    const yStep = chartHeight / 4

    for (let i = 0; i <= 4; i++) {
      const y = padding + chartHeight - i * yStep
      const value = Math.round((maxValue * i) / 4)
      ctx.fillText(value.toString(), padding - 10, y + 4)
    }
  }, [])

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-bold">Message Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">Messages sent over the past year</p>
        <div className="h-80 w-full">
          <canvas ref={canvasRef} className="w-full h-full"></canvas>
        </div>
      </CardContent>
    </Card>
  )
}
