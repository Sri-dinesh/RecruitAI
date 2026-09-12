import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://recruitaiofficial.vercel.app'),
  title: "RecruitAI | Precision Candidate Intelligence",
  description: "RecruitAI automates technical evaluations, parses resumes instantly, and enforces blind screening with uncompromising accuracy. The intelligence layer for modern recruiting.",
  authors: [{ name: "RecruitAI Team" }],
  openGraph: {
    title: "RecruitAI | Precision Candidate Intelligence",
    description: "Automate technical evaluations, parse resumes instantly, and enforce blind screening with perfect accuracy.",
    url: "https://recruitaiofficial.vercel.app",
    siteName: "RecruitAI",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "RecruitAI Logo" }],
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  verification: {
    google: "IxhpEchCtN13IET3Rco_2tzGFES6y4ta28iAQgLYIxU",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#F8F6F2] text-[#111111]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
