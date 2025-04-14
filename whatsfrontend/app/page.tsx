import { Upload } from "@/components/upload"
import { Features } from "@/components/features"
import { Hero } from "@/components/hero"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <Hero />
      <Upload />
      <Features />
    </main>
  )
}
