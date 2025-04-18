// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // Tailwind is usually imported here

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "File Analyzer App", // Change Title
  description: "Upload a file for analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}