import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme-provider";

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
    default: "Aether · Project Nexus",
    template: "%s · Aether",
  },
  description:
    "An interactive playground for the Aether programming language. Write, run, and explore Aether code in your browser — powered by a real in-browser lexer, parser, type-checker, and tree-walking evaluator.",
  keywords: [
    "Aether",
    "Project Nexus",
    "programming language",
    "playground",
    "compiler",
    "TypeScript",
    "Next.js",
  ],
  authors: [{ name: "Project Nexus" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Aether · Project Nexus",
    description:
      "An interactive playground for the Aether programming language — write, run, and explore code in your browser.",
    siteName: "Aether",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aether · Project Nexus",
    description:
      "An interactive playground for the Aether programming language — write, run, and explore code in your browser.",
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
          {children}
          <SonnerToaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
