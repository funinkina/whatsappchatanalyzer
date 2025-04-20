import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import Image from 'next/image';
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "Bloop",
  description: "Over-analyze your Whatsapp chats",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.className} flex flex-col min-h-screen`}> {/* Ensure body takes full height */}
        <Analytics />
        <div className="flex-grow"> {/* Allow content to push footer down */}
          {children}
        </div>
        {/* Footer Adjustments */}
        <footer className="bg-blue-950/90 text-amber-50 flex flex-col md:flex-row items-center justify-between p-6 md:p-8 lg:px-16 xl:px-24"> {/* Responsive padding, flex direction, alignment */}
          {/* Left Section (Logo & Open Source) */}
          {/* Stack vertically centered on mobile, row aligned end on medium+ */}
          <div className="flex flex-col items-center md:flex-row md:items-end text-center md:text-left mb-6 md:mb-0">
            <Image
              src="/bloop_white.svg"
              alt="Bloop Logo"
              width={300} // Base width hint (used for aspect ratio)
              height={100} // Base height hint
              className="w-48 md:w-60 lg:w-72 h-auto mb-2 md:mb-0" // Responsive width
              draggable="false"
            />
            {/* Responsive margin/padding, text size */}
            <p className="text-sm lg:text-base md:ml-3">
              Fully open source - visit the{" "}
              <a
                className="underline hover:text-amber-200 transition-colors" // Added hover effect
                href="https://github.com/funinkina/whatsappchatanalyzer"
                target="_blank"
                rel="noopener noreferrer"
              >
                github repo
              </a>{" "}
              and ⭐ it
            </p>
          </div>

          {/* Right Section (Created By) */}
          {/* Center text on mobile, align right on medium+ */}
          <div className="text-center md:text-right">
            <Image
              src="/Created_by.svg"
              alt="Created by Funinkina" // More descriptive alt text
              width={200} // Base width hint
              height={200} // Base height hint (less relevant with h-auto)
              className="w-32 md:w-40 lg:w-48 h-auto mb-2 md:mb-4 mx-auto md:mx-0 md:ml-auto" // Responsive width, centering/alignment
            />
            {/* Responsive text size */}
            <p className="text-sm lg:text-base underline hover:text-amber-200 transition-colors"> {/* Added hover */}
              <a href="https://funinkina.is-a.dev" target="_blank" rel="noopener noreferrer">Aryan Kushwaha</a>
            </p>
            <p className="text-sm lg:text-base underline hover:text-amber-200 transition-colors"> {/* Added hover */}
              <a href="https://www.linkedin.com/in/abhiruchi-patil-bhagat-22b025235/" target="_blank" rel="noopener noreferrer">Abhiruchi Patil Bhagat</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}