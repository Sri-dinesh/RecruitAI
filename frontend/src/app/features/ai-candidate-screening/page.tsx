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
  title: "AI Candidate Screening Software — Rubric-Based Evaluation & Ranking",
  description: "AI candidate screening software that auto-generates 10-point rubrics from your JD, screens candidates blind, and produces side-by-side matrices with skill gaps, confidence scores and interview prompts.",
  path: "/features/ai-candidate-screening",
  keywords: ["AI candidate screening","candidate screening software","applicant screening software","candidate matching software","candidate evaluation software"],
});

const faq = [
  { question: "What makes this different from generic ATS scoring?", answer: "RecruitAI generates a rubric from your actual job description — not a fixed template. Scoring dimensions (technical mastery, system design, communication, velocity) are calibrated to your role and weighted by importance, with every score backed by extracted evidence from resumes." },
  { question: "Can we customize rubrics per role?", answer: "Yes. Edit weights (Core Skills, Architecture, Problem Solving, Communication, Velocity) via ±5% steppers, toggle blind mode per campaign, and reveal PII only when you move a candidate to interview." },
  { question: "How do you prevent hallucinated experience?", answer: "All agent outputs are validated against strict Pydantic schemas, and skill matches include source snippets from resume chunks. Candidates also receive red-flag detection for timeline gaps and unverifiable claims." },
  { question: "Is scoring auditable for compliance?", answer: "Every score, blind redaction decision and status change is timestamped and stored with tenant isolation. Bias audit endpoint reports selection-rate impact ratios for NYC LL144-style reviews." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Features", href: "/features" }, { name: "AI Candidate Screening", href: "/features/ai-candidate-screening" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: "RecruitAI — AI Candidate Screening", applicationCategory: "BusinessApplication", url: canonical("/features/ai-candidate-screening"), publisher: { "@id": `${SITE_URL}/#organization` }, description: "AI candidate screening with rubric scoring, blind mode and gap analysis.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
      { "@context": "https://schema.org", ...breadcrumbJsonLd(crumbs.map(c => ({ name: c.name, url: canonical(c.href) }))) },
      { "@context": "https://schema.org", ...faqJsonLd(faq) },
    ],
  };
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={ld} />
      <MarketingNav />
      <header className="border-b border-border bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-10">
          <Breadcrumbs items={crumbs} />
          <div className="max-w-3xl mt-4">
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Candidate Screening • Rubric Intelligence</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Score every candidate on the same objective rubric.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              Paste your JD, and RecruitAI drafts a <strong className="text-foreground">10-point multi-dimensional rubric</strong> automatically. Every candidate is graded blind against identical criteria — with matched skills, confidence scores, gaps and tailored interview questions rendered side-by-side.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Try screening live</Link>
              <Link href="/features/ai-resume-screening" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See resume ingestion →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl">From JD to calibrated rubric — in seconds</h2>
            <div className="mt-4 grid md:grid-cols-3 gap-4">
              {[
                { t: "JD Analysis", d: "Extracts role title, required skills, seniority and competencies. No manual rubric authoring." },
                { t: "Weighted Dimensions", d: "Five pillars — Core Skills, Architecture, Problem Solving, Communication, Velocity — adjustable with ±5% steppers." },
                { t: "Consistent Calibration", d: "Every candidate sees identical questions and weights, eliminating ad-hoc interviewer variance." },
              ].map((c) => (
                <div key={c.t} className="border border-border rounded-xl p-5 bg-[#F8F6F2]">
                  <div className="text-sm font-semibold">{c.t}</div>
                  <p className="text-sm text-muted leading-relaxed mt-2">{c.d}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">Side-by-side screening matrix</h2>
            <p className="text-sm text-muted leading-relaxed mt-3 max-w-3xl">
              Stop debating gut feelings in spreadsheets. RecruitAI’s matrix maps candidates on the same scale with <strong className="text-foreground">green ≥80% / amber 50-79% / rose &lt;50%</strong> fit tiers. At a glance you see verified strengths, gaps and suggested interview probes for each applicant, exportable to PDF for hiring committees.
            </p>
            <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
              <div className="border border-border rounded-xl p-5">
                <div className="font-semibold">What screening surfaces</div>
                <ul className="mt-2 list-disc pl-5 text-muted space-y-1 leading-relaxed">
                  <li>Stack mastery with source snippet citations</li>
                  <li>Years of depth per competency, with timeline validation</li>
                  <li>Impact metrics — scale, throughput, users, revenue affected</li>
                  <li>Flagged concerns: gaps, short tenures, scope mismatches</li>
                </ul>
              </div>
              <div className="border border-border rounded-xl p-5 bg-[#F8F6F2]">
                <div className="font-semibold">What it replaces</div>
                <ul className="mt-2 list-disc pl-5 text-muted space-y-1 leading-relaxed">
                  <li>15–20 hours per requisition of manual skimming</li>
                  <li>Inconsistent phone screens and unstructured feedback</li>
                  <li>Bias from name, photo or university prestige</li>
                  <li>Copy-pasted scorecards with no evidence</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">FAQ — Candidate screening</h2>
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
              { title: "Related features", links: [
                { label: "AI Resume Screening", href: "/features/ai-resume-screening", description: "How resumes are parsed before scoring" },
                { label: "Blind Hiring Vectors", href: "/features/blind-hiring", description: "Ensure scoring is demographically blind" },
                { label: "Recruitment Analytics", href: "/features/recruitment-automation", description: "From scoring to pipeline intelligence" },
              ]},
              { title: "Guides", links: [
                { label: "Candidate Screening Guide", href: "/guides/candidate-screening-guide", description: "Structured evaluation playbook for hiring managers" },
                { label: "AI Recruiting Guide", href: "/guides/ai-recruiting-guide", description: "When and how to automate responsibly" },
                { label: "Compare: Lever vs RecruitAI", href: "/compare/lever-vs-recruitai", description: "Where RecruitAI replaces ATS scoring gaps" },
              ]},
            ]}
          />
        </article>
        <RelatedCTA title="Score your next 100 candidates free" description="Bring your JD and resumes. Get a calibrated rubric and blind scores in minutes — no talk with sales needed." href="/auth?tab=signup" label="Create Free Account" />
      </main>
      <Footer />
    </div>
  );
}
