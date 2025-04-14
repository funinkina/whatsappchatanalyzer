"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function EmojiUsage() {
  // Sample data - in a real app, this would come from your analysis
  const emojis = [
    { emoji: "😂", count: 483, percentage: 18 },
    { emoji: "❤️", count: 342, percentage: 13 },
    { emoji: "👍", count: 287, percentage: 11 },
    { emoji: "😊", count: 254, percentage: 10 },
    { emoji: "🎉", count: 198, percentage: 8 },
    { emoji: "🙏", count: 176, percentage: 7 },
    { emoji: "😍", count: 165, percentage: 6 },
    { emoji: "🤔", count: 143, percentage: 5 },
  ]

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-bold">Emoji Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">Most frequently used emojis in the chat</p>

        <div className="grid grid-cols-4 gap-4">
          {emojis.map((item, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl mb-2">{item.emoji}</div>
              <div className="text-lg font-bold text-gray-800">{item.count}</div>
              <div className="text-sm text-gray-500">{item.percentage}%</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Total Emojis Used</span>
            <span className="text-sm font-medium text-gray-700">2,648</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full"
              style={{ width: "100%" }}
            ></div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
