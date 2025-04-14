import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function DashboardHeader() {
  return (
    <header className="bg-white shadow-md py-4">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Chat Analysis</h1>
            <p className="text-sm text-gray-500">WhatsApp Group: "Friends Forever" (Sample Data)</p>
          </div>
        </div>

        <Button className="bg-pink-500 hover:bg-pink-600 text-white">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>
    </header>
  )
}
