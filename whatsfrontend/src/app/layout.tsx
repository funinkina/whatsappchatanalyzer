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
      <body className={`${dmSans.className} flex flex-col min-h-screen`}>
        <Analytics />
        <div className="flex-grow">
          {children}
        </div>
        <footer className="bg-blue-950/90 text-amber-50 flex flex-col md:flex-row items-center justify-between p-6 md:p-8 lg:px-60 xl:px-60 2xl:px-60">
          <div className="flex flex-col items-center md:flex-row md:items-end text-center md:text-left mb-6 md:mb-0">
            <Image
              src="/bloop_white.svg"
              alt="Bloop Logo"
              width={300}
              height={100}
              className="w-48 md:w-60 lg:w-72 h-auto mb-2 md:mb-0"
              draggable="false"
            />

            <p className="text-sm lg:text-base md:ml-3">
              Fully open source - visit the{" "}
              <a
                className="underline hover:text-amber-200 transition-colors"
                href="https://github.com/funinkina/whatsappchatanalyzer"
                target="_blank"
                rel="noopener noreferrer"
              >
                github repo
              </a>{" "}
              and ⭐ it
            </p>
          </div>

          <div className="text-center md:text-right">
            <Image
              src="/Created_by.svg"
              alt="Created by Funinkina"
              width={200}
              height={200}
              className="w-32 md:w-40 lg:w-48 h-auto mb-2 md:mb-4 mx-auto md:mx-0 md:ml-auto"
            />
            <p className="text-sm lg:text-base underline hover:text-amber-200 transition-colors">
              <a href="https://funinkina.is-a.dev" target="_blank" rel="noopener noreferrer">Aryan Kushwaha</a>
            </p>
            <p className="text-sm lg:text-base underline hover:text-amber-200 transition-colors">
              <a href="https://www.linkedin.com/in/abhiruchi-patil-bhagat-22b025235/" target="_blank" rel="noopener noreferrer">Abhiruchi Patil Bhagat</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}