import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme-provider";
import { QueryProvider } from "@/lib/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ATLAS · Autonomous Technical Limit Assessment System",
    template: "%s · ATLAS",
  },
  description:
    "ATLAS is a real-time dashboard that visualizes AI agent capability, limits, and benchmark performance for the registered runtime environment.",
  keywords: [
    "ATLAS",
    "AI agent",
    "benchmark",
    "capability",
    "limits",
    "telemetry",
    "Next.js",
    "TypeScript",
  ],
  authors: [{ name: "ATLAS Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "ATLAS · Autonomous Technical Limit Assessment System",
    description:
      "Real-time dashboard for AI agent capability, limits, and benchmark performance.",
    siteName: "ATLAS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ATLAS · Autonomous Technical Limit Assessment System",
    description:
      "Real-time dashboard for AI agent capability, limits, and benchmark performance.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <QueryProvider>
            {children}
            <SonnerToaster position="bottom-right" richColors closeButton />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
