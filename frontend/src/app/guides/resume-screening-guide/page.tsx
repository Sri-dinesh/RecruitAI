import type { Metadata } from "next";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { InternalLinks, RelatedCTA } from "@/components/seo/InternalLinks";
import { buildMetadata, canonical, breadcrumbJsonLd, articleJsonLd, faqJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "Resume Screening Guide — From PDF to Ranked Shortlist",
  description: "Resume screening guide: PDF/DOCX parsing, semantic chunking, pgvector indexing, blind redaction and score calibration checklist for consistent, defensible shortlists.",
  path: "/guides/resume-screening-guide",
  keywords: ["resume screening guide","how to screen resumes","screening process","resume parser guide"],
  ogType: "article",
});

const published = "2026-04-01T00:00:00.000Z";
const modified = "2026-09-10T00:00:00.000Z";

const faq = [
  { question: "Should we use AI to auto-reject?", answer: "No. Use AI to rank and flag gaps; keep rejection human. Auto-rejection at high volume without monitoring creates legal exposure and candidate harm." },
  { question: "How do we calibrate scores across roles?", answer: "Maintain role families (backend, frontend, data, product) with stored rubrics; re-weight dimensions when business priorities shift (e.g., architecture > velocity for platform roles)." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: "Resume Screening Guide", href: "/guides/resume-screening-guide" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      articleJsonLd({ headline: "Resume Screening Guide — From PDF to Ranked Shortlist", description: "Playbook for parsing, embedding, blind screening and calibration.", url: canonical("/guides/resume-screening-guide"), datePublished: published, dateModified: modified }),
      { "@context": "https://schema.org", ...breadcrumbJsonLd(crumbs.map(c => ({ name: c.name, url: canonical(c.href) }))) },
      { "@context": "https://schema.org", ...faqJsonLd(faq) },
    ],
  };
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={ld} />
      <MarketingNav />
      <div className="max-w-4xl mx-auto px-6 md:px-8 py-10">
        <Breadcrumbs items={crumbs} />
        <article className="mt-6 bg-white border border-border rounded-2xl p-8 md:p-10">
          <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Guide • Playbook</span>
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight mt-4">Resume screening guide — from PDF chaos to ranked shortlist.</h1>
          <p className="text-sm text-muted mt-3">Published {new Date(published).toLocaleDateString()} • Updated {new Date(modified).toLocaleDateString()} • 14 min read</p>

          <div className="mt-8 space-y-8 text-sm leading-relaxed">
            <section>
              <h2 className="font-serif text-xl">1. Intake hygiene</h2>
              <ul className="mt-3 list-disc pl-5 text-muted space-y-1">
                <li>Require plain-text-friendly PDFs; OCR where needed but flag image-only scans.</li>
                <li>Deduplicate by email/name before scoring — avoid double-ranking the same candidate.</li>
                <li>Tag source (referral, inbound, sourcing) for later pipeline analytics.</li>
              </ul>
            </section>
            <section>
              <h2 className="font-serif text-xl">2. Semantic screening beats keyword gating</h2>
              <p className="text-muted mt-3">Break resumes into semantic chunks, embed with Gemini 384-d vectors, index in pgvector. Query with your JD + expanded synonyms (“distributed cache” → Redis, Memcached, cache coherence). Rank by cosine similarity <em>and</em> rubric weights — so a stellar systems engineer isn’t rejected for omitting the acronym “Kubernetes” when they wrote “container orchestration at scale.”</p>
            </section>
            <section>
              <h2 className="font-serif text-xl">3. Calibration checklist</h2>
              <ol className="mt-3 list-decimal pl-5 text-muted space-y-1">
                <li>Validate JD: does rubric separate junior/mid/senior clearly? Adjust dimension weights.</li>
                <li>Blind mode: redact before scoring, not after. Log redaction.</li>
                <li>Cut line: decide interview threshold (e.g., ≥80%) before seeing names.</li>
                <li>Audit: sample 10 near-threshold candidates manually; tune if variance &gt;15%.</li>
              </ol>
            </section>
            <section>
              <h2 className="font-serif text-xl">FAQ</h2>
              <div className="mt-3 space-y-3">
                {faq.map((f) => (
                  <details key={f.question} className="group border border-border rounded-xl bg-[#faf9f7] px-5 py-4 open:bg-white">
                    <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">{f.question}<span className="text-muted group-open:rotate-180 transition-transform">▾</span></summary>
                    <p className="text-muted mt-3">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
            <InternalLinks groups={[
              { title: "Product", links: [
                { label: "AI Resume Screening", href: "/features/ai-resume-screening", description: "How parsing works at 1.38s per doc" },
                { label: "Blind Hiring", href: "/features/blind-hiring", description: "Keep screening unbiased" },
              ]},
              { title: "Next guides", links: [
                { label: "Candidate Screening Guide", href: "/guides/candidate-screening-guide", description: "From scoring to interview kit" },
                { label: "ATS Guide", href: "/guides/ats-guide", description: "Where scored candidates go next" },
              ]},
            ]} />
          </div>
        </article>
        <div className="mt-8"><RelatedCTA title="Screen your next 100 resumes free" description="Bring JD + PDFs. RecruitAI handles chunking, embedding and blind scoring." href="/auth?tab=signup" label="Try Resume Screening" /></div>
      </div>
      <Footer />
    </div>
  );
}
