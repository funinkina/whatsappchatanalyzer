import { MessageSquare, BarChart2, Clock, Users, Smile, Calendar } from "lucide-react"

export function Features() {
  const features = [
    {
      icon: <MessageSquare className="h-10 w-10 text-pink-500" />,
      title: "Message Analysis",
      description: "See who sends the most messages and at what times of day",
    },
    {
      icon: <BarChart2 className="h-10 w-10 text-purple-500" />,
      title: "Conversation Trends",
      description: "Discover patterns in your chat activity over time",
    },
    {
      icon: <Clock className="h-10 w-10 text-teal-500" />,
      title: "Response Times",
      description: "Find out average response times between participants",
    },
    {
      icon: <Users className="h-10 w-10 text-orange-500" />,
      title: "Participant Insights",
      description: "Learn who's most active in group conversations",
    },
    {
      icon: <Smile className="h-10 w-10 text-yellow-500" />,
      title: "Emoji Analysis",
      description: "See which emojis are used most frequently",
    },
    {
      icon: <Calendar className="h-10 w-10 text-green-500" />,
      title: "Timeline View",
      description: "Visualize your conversation history on an interactive timeline",
    },
  ]

  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-800 mb-4">Discover Chat Insights</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our analyzer reveals fascinating patterns and statistics from your WhatsApp conversations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all border border-gray-100"
            >
              <div className="bg-white rounded-full w-16 h-16 flex items-center justify-center mb-4 shadow-sm">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
