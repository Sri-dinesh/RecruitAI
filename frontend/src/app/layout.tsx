import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";

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
  title: "RecruitAI | Precision Candidate Intelligence",
  description: "RecruitAI automates technical evaluations, parses resumes instantly, and enforces blind screening with uncompromising accuracy. The intelligence layer for modern recruiting.",
  keywords: ["AI Recruitment", "ATS Integration", "Candidate Screening", "Blind Hiring", "Talent Intelligence", "LangGraph"],
  authors: [{ name: "RecruitAI Team" }],
  openGraph: {
    title: "RecruitAI | Precision Candidate Intelligence",
    description: "Automate technical evaluations, parse resumes instantly, and enforce blind screening with perfect accuracy.",
    url: "https://recruitai.io",
    siteName: "RecruitAI",
    type: "website",
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
      <body className="min-h-full flex flex-col font-sans bg-[#F8F6F2] text-[#111111]">{children}</body>
    </html>
  );
}
