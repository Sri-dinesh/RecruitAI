import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  themeColor: "#1B2A4A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://recruitaiofficial.vercel.app"),
  title: {
    default: "RecruitAI | Precision Candidate Intelligence & AI Recruiter",
    template: "%s | RecruitAI",
  },
  description: "RecruitAI automates technical evaluations, parses resumes instantly, and enforces blind screening with uncompromising accuracy. The autonomous intelligence layer for modern recruiting.",
  applicationName: "RecruitAI",
  keywords: [
    "RecruitAI",
    "AI recruiter",
    "candidate intelligence",
    "talent intelligence",
    "blind screening",
    "blind hiring",
    "automated resume parsing",
    "LangGraph recruiter",
    "objective rubric scoring",
    "ATS candidate screening",
    "HR tech AI",
    "technical recruiting automation",
    "unbiased hiring platform"
  ],
  authors: [{ name: "RecruitAI Team", url: "https://recruitaiofficial.vercel.app" }],
  creator: "RecruitAI",
  publisher: "RecruitAI",
  category: "technology",
  classification: "Recruitment & Talent Intelligence Software",
  alternates: {
    canonical: "https://recruitaiofficial.vercel.app",
  },
  openGraph: {
    title: "RecruitAI | Precision Candidate Intelligence & AI Recruiter",
    description: "Autonomous multi-agent recruitment platform. Automate technical evaluations, enforce blind screening, and streamline hiring with human-in-the-loop oversight.",
    url: "https://recruitaiofficial.vercel.app",
    siteName: "RecruitAI",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "RecruitAI - Precision Candidate Intelligence Platform",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RecruitAI | Precision Candidate Intelligence & AI Recruiter",
    description: "Autonomous multi-agent recruitment platform with blind technical screening and human-in-the-loop oversight.",
    images: ["/og-image.png"],
    creator: "@RecruitAI",
    site: "@RecruitAI",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "IxhpEchCtN13IET3Rco_2tzGFES6y4ta28iAQgLYIxU",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "RecruitAI",
    "format-detection": "telephone=no",
    "mobile-web-app-capable": "yes",
    "al:android:url": "recruitai://",
    "al:android:package": "com.recruitai.app",
    "al:android:app_name": "RecruitAI",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": "https://recruitaiofficial.vercel.app/#webapp",
      "name": "RecruitAI",
      "url": "https://recruitaiofficial.vercel.app",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web, Android, iOS",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock"
      },
      "description": "Autonomous AI recruiter and precision candidate intelligence platform featuring blind screening, multi-agent evaluation, and human-in-the-loop workflows.",
      "browserRequirements": "Requires JavaScript. Requires HTML5.",
      "softwareVersion": "1.0.0",
      "featureList": [
        "Autonomous Multi-Agent Candidate Screening",
        "Blind Demographically-Redacted Evaluation",
        "Instant PDF/DOCX Resume Ingestion & pgvector Embeddings",
        "Objective Multi-Dimensional Rubric Scoring",
        "Human-in-the-Loop Email Outreach Confirmation",
        "Greenhouse, Lever, and Workday ATS Export",
        "Real-Time Hiring Analytics and Pipeline Velocity Tracking"
      ],
      "screenshot": "https://recruitaiofficial.vercel.app/og-image.png",
      "author": {
        "@type": "Organization",
        "name": "RecruitAI",
        "url": "https://recruitaiofficial.vercel.app"
      }
    },
    {
      "@type": "Organization",
      "@id": "https://recruitaiofficial.vercel.app/#organization",
      "name": "RecruitAI",
      "url": "https://recruitaiofficial.vercel.app",
      "logo": {
        "@type": "ImageObject",
        "url": "https://recruitaiofficial.vercel.app/logo.png",
        "width": 512,
        "height": 512
      },
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "santhisridinesh@gmail.com",
        "contactType": "customer support"
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://recruitaiofficial.vercel.app/#website",
      "url": "https://recruitaiofficial.vercel.app",
      "name": "RecruitAI",
      "publisher": {
        "@id": "https://recruitaiofficial.vercel.app/#organization"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://recruitaiofficial.vercel.app/#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What data does RecruitAI store?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Only what you provide: account email, job descriptions, resumes, generated embeddings, and campaign chat history. All scoped to your authenticated account via Supabase Row-Level Security (RLS)."
          }
        },
        {
          "@type": "Question",
          "name": "Does RecruitAI send emails or book meetings automatically?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. Both actions require explicit human confirmation ('yes' / 'confirm' in chat). Without your approval, drafts are never sent and no calendar event is created."
          }
        },
        {
          "@type": "Question",
          "name": "Is blind screening truly anonymized?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When enabled, names, emails, phone numbers, locations, and other identifiers are redacted prior to scoring. You can toggle this per campaign and reveal context only when you choose."
          }
        },
        {
          "@type": "Question",
          "name": "How do I delete my data?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Delete individual campaigns from the dashboard, or request full account and data deletion via the Data Deletion page or by emailing support at santhisridinesh@gmail.com."
          }
        },
        {
          "@type": "Question",
          "name": "Where can I get help?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Contact santhisridinesh@gmail.com or visit the Support page. For store listing issues, include your order ID and device details."
          }
        }
      ]
    }
  ]
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
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[#F8F6F2] text-[#111111]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
