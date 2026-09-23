import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { InternalLinks, RelatedCTA } from "@/components/seo/InternalLinks";
import { buildMetadata, canonical, breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "AI Resume Screening Software — Automated Screening in Seconds",
  description: "AI resume screening software that parses PDFs and DOCX in 1.4s, creates pgvector embeddings, and scores candidates against your JD. Replace manual skimming with semantic matching at <2s query latency.",
  path: "/features/ai-resume-screening",
  keywords: ["AI resume screening","automated resume screening","resume screening software","resume screening automation","AI resume parser"],
});

const faq = [
  { question: "How accurate is AI resume screening vs. keyword filters?", answer: "RecruitAI uses 384-dimension Gemini embeddings with cosine similarity, so it matches skills even when phrased differently (e.g., ‘distributed cache’ vs ‘Redis cluster tuning’). Keyword ATS rejects qualified talent who don’t use exact job description wording; semantic screening does not." },
  { question: "What file types are supported?", answer: "PDF, DOCX and plain text. Multi-page resumes are chunked semantically, embedded and stored in pgvector with IVFFlat indexing for 31ms p95 retrieval." },
  { question: "Does resume data train AI models?", answer: "No. Resumes are processed transiently through enterprise API endpoints, stored only in your tenant with Supabase RLS, and never used to train public foundation models." },
  { question: "How fast can we screen 500 resumes?", answer: "Ingestion runs at ~1.38s per document with parallel embedding. A 500-resume batch is typically parsed and ranked within minutes, compared with 15–20 hours manually." },
];

export default function AIResumeScreeningPage() {
  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Features", href: "/features" },
    { name: "AI Resume Screening", href: "/features/ai-resume-screening" },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "RecruitAI — AI Resume Screening",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Android",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: "AI resume screening software that automates parsing, vectorization and semantic candidate ranking with blind hiring safeguards.",
        url: canonical("/features/ai-resume-screening"),
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      { "@context": "https://schema.org", ...breadcrumbJsonLd(breadcrumbItems.map(b => ({ name: b.name, url: canonical(b.href) }))) },
      { "@context": "https://schema.org", ...faqJsonLd(faq) },
    ],
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={jsonLd} />
      <MarketingNav />
      <header className="border-b border-border bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-10">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="mt-4 max-w-3xl">
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">AI Resume Screening • Automated & Semantic</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Stop skimming resumes. Start ranking candidates semantically.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              Upload PDFs, DOCX and text — <strong className="text-foreground">parsed in 1.38s per document</strong>, vectorized with Google Text Embeddings, and scored against your role rubric in under 2 seconds. RecruitAI eliminates keyword luck and surfaces engineers with real depth.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66] transition-colors">Start screening free</Link>
              <Link href="/features/ai-candidate-screening" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold hover:bg-[#faf9f7]">See candidate scoring →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        {/* Performance strip */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { k: "Parsing speed", v: "1.38s / doc", d: "PDF/DOCX extraction + chunking" },
            { k: "Embedding latency", v: "185ms", d: "Gemini text-embedding-004, 384-d" },
            { k: "Vector retrieval", v: "31ms p95", d: "pgvector cosine similarity" },
            { k: "Batch throughput", v: "500+ docs", d: "Parallel ingestion & ranking" },
          ].map((m) => (
            <div key={m.k} className="bg-white border border-border rounded-xl p-5">
              <div className="text-xs font-semibold tracking-widest uppercase text-muted">{m.k}</div>
              <div className="text-2xl font-serif font-bold mt-1">{m.v}</div>
              <div className="text-xs text-muted mt-1">{m.d}</div>
            </div>
          ))}
        </section>

        {/* Core content */}
        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl md:text-3xl">Why AI resume screening, not keyword filtering?</h2>
            <p className="text-sm text-muted leading-relaxed mt-3">
              Legacy ATS rewards resume keyword stuffing and rejects strong candidates who describe experience differently. RecruitAI evaluates <em>meaning</em>: pgvector embeddings capture semantic equivalence — “led a team migrating a monolith to K8s microservices” matches “Kubernetes operator development & distributed systems migration” without requiring exact word overlap. Recruiters define a rubric (technical skills, architecture, communication, velocity) and every candidate is graded consistently.
            </p>
            <ul className="mt-4 grid md:grid-cols-2 gap-3 text-sm">
              {[
                "Deterministic Pydantic schemas — zero hallucinations in export payloads",
                "Confidence scores + highlighted gaps guide interview question generation",
                "Audit-logged, timestamped evaluations for fairness reviews",
                "Works for engineering, product and go-to-market roles (not just tech)",
              ].map((t) => (
                <li key={t} className="flex gap-2.5 bg-[#F8F6F2] border border-border rounded-lg px-4 py-3">
                  <span className="text-emerald-600 font-bold">✓</span><span className="text-muted leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl">How it works</h2>
            <div className="mt-4 grid md:grid-cols-3 gap-4">
              <div className="border border-border rounded-xl p-5">
                <div className="text-xs font-bold tracking-widest uppercase text-accent">01 • Ingest</div>
                <h3 className="font-semibold mt-2">Bulk upload & clean extraction</h3>
                <p className="text-sm text-muted leading-relaxed mt-2">Drop up to hundreds of PDFs at once. Text is normalized, deduplicated and chunked semantically — not truncated at random boundaries.</p>
              </div>
              <div className="border border-border rounded-xl p-5">
                <div className="text-xs font-bold tracking-widest uppercase text-accent">02 • Vectorize</div>
                <h3 className="font-semibold mt-2">Embed & index</h3>
                <p className="text-sm text-muted leading-relaxed mt-2">Gemini embeddings (384-d MRL) are written to pgvector with IVFFlat clustering. Retrieval is 31ms even across thousands of chunks.</p>
              </div>
              <div className="border border-border rounded-xl p-5">
                <div className="text-xs font-bold tracking-widest uppercase text-accent">03 • Score</div>
                <h3 className="font-semibold mt-2">Rank against rubric</h3>
                <p className="text-sm text-muted leading-relaxed mt-2">Candidates are scored on your job’s calibrated dimensions. Blind mode redacts PII before the scorer ever sees text.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">FAQ — AI resume screening</h2>
            <div className="mt-4 space-y-3">
              {faq.map((f) => (
                <details key={f.question} className="group border border-border rounded-xl bg-[#faf9f7] px-5 py-4 open:bg-white">
                  <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">{f.question}<span className="text-muted group-open:rotate-180 transition-transform">▾</span></summary>
                  <p className="text-sm text-muted leading-relaxed mt-3">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <InternalLinks
            groups={[
              {
                title: "Next steps",
                links: [
                  { label: "AI Candidate Screening — rubric deep dive", href: "/features/ai-candidate-screening", description: "See how 10-point rubrics are generated from your JD" },
                  { label: "Blind Hiring Mode", href: "/features/blind-hiring", description: "Read how we eliminate demographic leakage" },
                  { label: "ATS Integration", href: "/features/ats-integration", description: "Push scored candidates directly to Greenhouse & Lever" },
                ],
              },
              {
                title: "Guides & Comparisons",
                links: [
                  { label: "Resume Screening Guide", href: "/guides/resume-screening-guide", description: "Playbook for consistent, defensible screening" },
                  { label: "Greenhouse vs RecruitAI", href: "/compare/greenhouse-vs-recruitai", description: "Head-to-head on automation & bias control" },
                  { label: "For HR Teams", href: "/solutions/hr-teams", description: "How talent partners run 10x more pipelines" },
                ],
              },
            ]}
          />
        </article>

        <RelatedCTA title="Try AI resume screening on your next role" description="Create a campaign, upload your JD + resumes, and get objective scores with blind mode — no setup calls, no sales demo required." href="/auth?tab=signup" label="Start Free  — 100 evaluations included" />
      </main>
      <Footer />
    </div>
  );
}
