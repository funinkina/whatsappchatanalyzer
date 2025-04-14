import { Card, CardContent } from "@/components/ui/card"
import { MessageSquare, Clock, Calendar, Send } from "lucide-react"

export function ChatStats() {
  const stats = [
    {
      icon: <MessageSquare className="h-8 w-8 text-pink-500" />,
      value: "12,483",
      label: "Total Messages",
      change: "+24%",
      positive: true,
    },
    {
      icon: <Clock className="h-8 w-8 text-purple-500" />,
      value: "8:32 PM",
      label: "Most Active Time",
      change: "Evening peak",
      positive: true,
    },
    {
      icon: <Calendar className="h-8 w-8 text-teal-500" />,
      value: "342",
      label: "Active Days",
      change: "96% of year",
      positive: true,
    },
    {
      icon: <Send className="h-8 w-8 text-orange-500" />,
      value: "4.2 min",
      label: "Avg. Response Time",
      change: "-18%",
      positive: true,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card key={index} className="border-none shadow-lg hover:shadow-xl transition-all">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-800">{stat.value}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-full">{stat.icon}</div>
            </div>
            <div className={`mt-4 text-sm ${stat.positive ? "text-green-500" : "text-red-500"}`}>{stat.change}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
