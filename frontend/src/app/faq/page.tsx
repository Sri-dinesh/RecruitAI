import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { buildMetadata, canonical, breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "FAQ — AI Recruiting, Resume Screening & Hiring Platform Questions",
  description: "RecruitAI FAQ: AI resume screening, blind hiring, candidate scoring, ATS integration, mobile app and privacy — with human-in-the-loop, RLS security and deletion guarantees.",
  path: "/faq",
  keywords: ["recruitai faq","AI recruiting FAQ","resume screening FAQ","ATS FAQ","blind hiring FAQ"],
});

const faqs = [
  { q: "What is RecruitAI?", a: "An AI recruiting platform that automates resume parsing, generates rubrics from your JD, scores candidates blind, and exports hire-ready payloads to Greenhouse, Lever and Workday — with human confirmation required before any email sends." },
  { q: "Will AI replace recruiters?", a: "No. It automates parsing, scoring and draft generation. Recruiters remain responsible for shortlist selection, interviews, offers and fairness oversight — with audit logs for every decision." },
  { q: "How accurate is AI resume screening?", a: "Candidates are ranked by 384-dimension Gemini embeddings via pgvector cosine similarity, so alternative phrasing (‘container orchestration’ vs ‘Kubernetes’) is recognized as equivalent. Keyword ATS misses such candidates; RecruitAI does not." },
  { q: "What does blind hiring hide?", a: "Names, contacts, photos, locations, graduation years and gendered pronouns are redacted before LLM scoring. You reveal identity only when moving a candidate to interview." },
  { q: "Which ATS integrations exist?", a: "Greenhouse, Lever, Workday and Ashby via validated JSON/CSV exports matching their schemas. Enterprise adds sync with webhook triggers." },
  { q: "Is data used to train AI models?", a: "No. Resumes are processed transiently, stored only in your RLS-isolated tenant, and never used to train public foundation models." },
  { q: "How do we delete candidate or recruiter data?", a: "Delete campaigns in dashboard or full account via Profile → Delete Account (mobile/web). Email deletion requests are verified and completed within 7 business days. See Data Deletion portal for steps." },
  { q: "Does RecruitAI send emails automatically?", a: "Never. Outreach drafts and calendar slots wait for explicit ‘yes’ / ‘confirm’ before sending or booking — the Human-in-the-Loop guarantee." },
  { q: "Is there a mobile app?", a: "Yes: official Android app on Google Play built with Expo 57. It mirrors web workflows with offline-queued approvals and analytics." },
  { q: "What does it cost?", a: "Free tier includes 100 candidate evaluations. Paid plans scale by evaluations/seats. No credit card to start — see Pricing for current tiers." },
  { q: "How fast is setup?", a: "Under two minutes: paste JD, drop PDFs/DOCX, generate rubric, receive blind scores. No sales call required." },
];

export default function Page() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@context": "https://schema.org", ...faqJsonLd(faqs.map(f => ({ question: f.q, answer: f.a }))) },
      { "@context": "https://schema.org", ...breadcrumbJsonLd([{ name: "Home", url: SITE_URL }, { name: "FAQ", url: canonical("/faq") }]) },
    ],
  };
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={ld} />
      <MarketingNav />
      <header className="border-b border-border bg-white">
        <div className="max-w-4xl mx-auto px-6 md:px-8 py-10">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "FAQ", href: "/faq" }]} />
          <div className="mt-4">
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Knowledge Base • FAQPage Schema Eligible</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Frequently asked questions.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">Answers for recruiters, hiring managers, legal and talent ops — and for Google’s FAQ rich results. Still stuck? <Link href="/support" className="underline text-accent">Contact support</Link>.</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 md:px-8 py-10">
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group bg-white border border-border rounded-xl px-6 py-5 open:bg-[#faf9f7]" open>
              <summary className="flex justify-between items-center cursor-pointer font-semibold list-none">{f.q}<span className="ml-4 text-muted group-open:rotate-180 transition-transform">▾</span></summary>
              <p className="text-sm text-muted leading-relaxed mt-3">{f.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-10 bg-white border border-border rounded-2xl p-6">
          <h2 className="font-semibold">Deeper reading</h2>
          <div className="mt-3 grid md:grid-cols-3 gap-3 text-sm">
            <Link href="/features/ai-resume-screening" className="bg-[#F8F6F2] border border-border rounded-xl p-4 hover:border-accent/30">AI Resume Screening →<div className="text-xs text-muted mt-1">Semantic vs keyword filtering</div></Link>
            <Link href="/features/blind-hiring" className="bg-[#F8F6F2] border border-border rounded-xl p-4 hover:border-accent/30">Blind Hiring →<div className="text-xs text-muted mt-1">PII redaction guardrails</div></Link>
            <Link href="/guides" className="bg-white border border-border rounded-xl p-4 hover:border-accent/30">All Guides →<div className="text-xs text-muted mt-1">Playbooks for consistent hiring</div></Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
