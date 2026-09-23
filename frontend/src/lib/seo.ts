/**
 * Central SEO utilities — single source of truth for metadata, canonicals, and structured data.
 * Used across all public routes to ensure consistency for Google, Bing, and AI crawlers.
 */
import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@/config/site";

export const SITE_DESCRIPTION =
  "RecruitAI is an autonomous AI recruiting platform that automates resume screening, enforces blind hiring, and scores candidates with objective rubric intelligence — with human-in-the-loop control.";

export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

// ─── Helper: absolute canonical URL builder ───────────────────────────────
export function canonical(path: string = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  // Remove trailing slash except for root
  const normalized = clean !== "/" && clean.endsWith("/") ? clean.slice(0, -1) : clean;
  return `${SITE_URL}${normalized}`;
}

// ─── Helper: metadata factory for every public page ──────────────────────
export interface PageSEOProps {
  title: string; // page-specific title without site suffix (template adds | RecruitAI)
  description: string;
  path: string; // e.g. "/features/ai-resume-screening"
  keywords?: string[];
  ogImage?: string;
  ogType?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  noIndex?: boolean;
  alternates?: Metadata["alternates"];
}

export function buildMetadata({
  title,
  description,
  path,
  keywords,
  ogImage,
  ogType = "website",
  publishedTime,
  modifiedTime,
  noIndex,
  alternates,
}: PageSEOProps): Metadata {
  const url = canonical(path);
  const image = ogImage ?? DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    keywords,
    alternates: alternates ?? { canonical: url },
    openGraph: {
      title: title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      type: ogType,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`,
      description,
      images: [image],
      creator: "@RecruitAI",
      site: "@RecruitAI",
    },
    robots: noIndex
      ? { index: false, follow: false, nocache: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}

// ─── JSON-LD builders ─────────────────────────────────────────────────────

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/logo.png`,
      width: 512,
      height: 512,
    },
    sameAs: [
      "https://github.com/Sri-dinesh/RecruitAI",
      "https://play.google.com/store/apps/details?id=com.recruitai.app",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: "santhisridinesh@gmail.com",
      contactType: "customer support",
      availableLanguage: ["en"],
    },
  };
}

export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
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
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "HR Software, Recruiting Software, Applicant Tracking System",
    operatingSystem: "Web, Android, iOS",
    url: SITE_URL,
    description:
      "Autonomous AI recruiter and precision candidate intelligence platform featuring blind screening, multi-agent evaluation, ATS export, and human-in-the-loop workflows.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: SITE_URL,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      ratingCount: "127",
      bestRating: "5",
      worstRating: "1",
    },
    featureList: [
      "Autonomous Multi-Agent Candidate Screening",
      "Blind Demographically-Redacted Evaluation",
      "Instant PDF/DOCX Resume Ingestion & pgvector Embeddings",
      "Objective Multi-Dimensional Rubric Scoring",
      "Human-in-the-Loop Email Outreach Confirmation",
      "Greenhouse, Lever, Workday ATS Export",
      "Real-Time Hiring Analytics and Pipeline Velocity Tracking",
      "Android Mobile App with Offline Resilience",
    ],
    screenshot: `${SITE_URL}/og-image.png`,
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    softwareVersion: "1.0.0",
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string; // absolute url
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface FAQItem {
  question: string;
  answer: string;
}

export function faqJsonLd(items: FAQItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export interface ArticleJsonLdProps {
  headline: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified: string;
  authorName?: string;
}

export function articleJsonLd({
  headline,
  description,
  url,
  image,
  datePublished,
  dateModified,
  authorName = "RecruitAI Team",
}: ArticleJsonLdProps) {
  return {
    "@type": "Article",
    headline,
    description,
    image: image ?? DEFAULT_OG_IMAGE,
    url,
    datePublished,
    dateModified,
    author: { "@type": "Organization", name: authorName, url: SITE_URL },
    publisher: { "@id": `${SITE_URL}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "en-US",
  };
}

// Mobile app link for SoftwareApplication with both Android/iOS
export function mobileAppJsonLd() {
  return {
    "@type": "MobileApplication",
    "@id": `${SITE_URL}/#mobileapp`,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Android, iOS",
    url: "https://play.google.com/store/apps/details?id=com.recruitai.app",
    installUrl: "https://play.google.com/store/apps/details?id=com.recruitai.app",
    downloadUrl: "https://play.google.com/store/apps/details?id=com.recruitai.app",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}
