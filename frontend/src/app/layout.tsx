import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import QueryProvider from "@/providers/QueryProvider";
import { SITE_URL } from "@/config/site";
import { AnalyticsScripts } from "@/components/seo/AnalyticsScripts";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  preload: true,
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const viewport: Viewport = {
  themeColor: "#1B2A4A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RecruitAI | AI Recruiting Software & Candidate Intelligence",
    template: "%s | RecruitAI",
  },
  description:
    "AI recruiting software for automated resume screening, blind candidate evaluation, ATS integration and hiring analytics. Screen 500+ resumes in seconds — with human-in-the-loop control.",
  applicationName: "RecruitAI",
  keywords: [
    "RecruitAI",
    "AI recruiting software",
    "AI recruitment platform",
    "AI recruiter",
    "AI resume screening",
    "AI candidate screening",
    "AI hiring platform",
    "recruitment automation",
    "applicant screening software",
    "AI ATS",
    "candidate matching",
    "recruiter AI assistant",
    "blind hiring",
    "blind screening",
    "AI interview tools",
    "recruitment analytics",
    "candidate intelligence",
    "resume screening automation",
    "talent intelligence",
    "technical recruiting automation",
    "unbiased hiring platform",
    "Greenhouse ATS integration",
    "Lever ATS alternative",
    "Workday recruiting",
  ],
  authors: [{ name: "RecruitAI Team", url: SITE_URL }],
  creator: "RecruitAI",
  publisher: "RecruitAI",
  category: "technology",
  classification: "Recruitment & Talent Intelligence Software",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "RecruitAI | AI Recruiting Software & Candidate Intelligence",
    description:
      "Autonomous multi-agent AI recruiting platform. Automate resume screening, enforce blind hiring, and streamline ATS workflows with human-in-the-loop oversight.",
    url: SITE_URL,
    siteName: "RecruitAI",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "RecruitAI - AI Recruiting Software & Candidate Intelligence",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RecruitAI | AI Recruiting Software & Candidate Intelligence",
    description: "AI recruiting software for automated resume screening, blind hiring and ATS-ready candidate scoring. Web & Android.",
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
    // Add in Vercel env: NEXT_PUBLIC_BING_VERIFICATION, NEXT_PUBLIC_YANDEX_VERIFICATION as needed
    ...(process.env.NEXT_PUBLIC_BING_VERIFICATION
      ? { other: { "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION } }
      : {}),
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
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "RecruitAI",
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "HR Software, Recruiting Software, Applicant Tracking System",
      operatingSystem: "Web, Android, iOS",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: SITE_URL,
      },
      description:
        "AI recruiting software for automated resume screening, blind hiring, objective rubric scoring, ATS export and hiring analytics — with human-in-the-loop control.",
      browserRequirements: "Requires JavaScript. Requires HTML5.",
      softwareVersion: "1.0.0",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        ratingCount: "127",
        bestRating: "5",
        worstRating: "1",
      },
      featureList: [
        "AI Resume Screening & Candidate Matching",
        "Blind Demographically-Redacted Evaluation",
        "Instant PDF/DOCX Resume Ingestion & pgvector Embeddings",
        "Objective Multi-Dimensional Rubric Scoring",
        "Human-in-the-Loop Email Outreach Confirmation",
        "Greenhouse, Lever, and Workday ATS Export",
        "Real-Time Hiring Analytics and Pipeline Velocity Tracking",
        "Android Mobile App with Offline Resilience",
      ],
      screenshot: `${SITE_URL}/og-image.png`,
      author: { "@type": "Organization", name: "RecruitAI", url: SITE_URL },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "RecruitAI",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
        width: 512,
        height: 512,
      },
      sameAs: ["https://github.com/Sri-dinesh/RecruitAI", "https://play.google.com/store/apps/details?id=com.recruitai.app"],
      contactPoint: {
        "@type": "ContactPoint",
        email: "santhisridinesh@gmail.com",
        contactType: "customer support",
        availableLanguage: ["en"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "RecruitAI",
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-US",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/guides?query={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What data does RecruitAI store?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Only what you provide: account email, job descriptions, resumes, generated embeddings, and campaign chat history. All scoped to your authenticated account via Supabase Row-Level Security (RLS).",
          },
        },
        {
          "@type": "Question",
          name: "Does RecruitAI send emails or book meetings automatically?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Both actions require explicit human confirmation ('yes' / 'confirm' in chat). Without your approval, drafts are never sent and no calendar event is created.",
          },
        },
        {
          "@type": "Question",
          name: "Is blind screening truly anonymized?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "When enabled, names, emails, phone numbers, locations, and other identifiers are redacted prior to scoring. You can toggle this per campaign and reveal context only when you choose.",
          },
        },
        {
          "@type": "Question",
          name: "How do I delete my data?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Delete individual campaigns from the dashboard, or request full account and data deletion via the Data Deletion page or by emailing support at santhisridinesh@gmail.com.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I get help?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Contact santhisridinesh@gmail.com or visit the Support page. For store listing issues, include your order ID and device details.",
          },
        },
      ],
    },
  ],
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
        <AnalyticsScripts />
        {/* Preconnect for performance — Supabase + Gemini */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://ytskjpsaypkngzeivhko.supabase.co" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[#F8F6F2] text-[#111111]">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:border focus:border-border focus:rounded-md focus:px-4 focus:py-2 focus:shadow-md">
          Skip to main content
        </a>
        <AuthProvider>
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
