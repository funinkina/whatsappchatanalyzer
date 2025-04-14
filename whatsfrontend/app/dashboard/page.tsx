import { DashboardHeader } from "@/components/dashboard/header"
import { ChatStats } from "@/components/dashboard/chat-stats"
import { MessageTimeline } from "@/components/dashboard/message-timeline"
import { ParticipantActivity } from "@/components/dashboard/participant-activity"
import { EmojiUsage } from "@/components/dashboard/emoji-usage"
import { WordCloud } from "@/components/dashboard/word-cloud"

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50 pb-16">
      <DashboardHeader />

      <div className="container mx-auto px-4 py-8">
        <ChatStats />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <MessageTimeline />
          <ParticipantActivity />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <EmojiUsage />
          <WordCloud />
        </div>
      </div>
    </main>
  )
}
