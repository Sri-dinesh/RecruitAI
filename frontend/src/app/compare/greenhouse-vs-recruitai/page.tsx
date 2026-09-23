import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { buildMetadata, canonical, breadcrumbJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "Greenhouse vs RecruitAI — AI Recruiting Alternative with Blind Hiring",
  description: "Compare Greenhouse vs RecruitAI: legacy ATS keyword filtering and manual scorecards vs AI resume screening, blind hiring, rubric intelligence and 1-click ATS handoff. See pricing, speed and audit trail differences.",
  path: "/compare/greenhouse-vs-recruitai",
  keywords: ["Greenhouse vs RecruitAI","Greenhouse alternative","ATS comparison","Greenhouse ATS vs AI recruiting"],
});

const rows = [
  { cap: "Screening method", greenhouse: "Keyword filtering + manual reviews; candidates win by stuffing terms.", recruitai: "Semantic embeddings + rubric scoring; matches meaning, not acronyms, with evidence citations." },
  { cap: "Bias control", greenhouse: "No built-in blind screening; names/photos visible before scoring.", recruitai: "PII redacted before LLM scoring; toggle per campaign and audit-log redaction." },
  { cap: "Scoring consistency", greenhouse: "Unstructured feedback with ±30% variance across interviewers.", recruitai: "Calibrated 5-pillar rubric auto-generated from JD; color-coded fit tiers." },
  { cap: "Pipeline velocity", greenhouse: "Hours per req; hiring managers wait on recruiter spreadsheets.", recruitai: "Sub-second retrieval; 500 resumes ranked in minutes, 31ms pgvector p95." },
  { cap: "ATS role", greenhouse: "System of record and attempted screening engine.", recruitai: "Intelligence layer before your ATS — exports Greenhouse-ready JSON/CSV; no migration needed." },
  { cap: "Human oversight", greenhouse: "Manual workflow; limited HITL automation.", recruitai: "LangGraph agents + explicit HITL gates block autonomous sends/calendar holds." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Compare", href: "/compare/greenhouse-vs-recruitai" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "Greenhouse vs RecruitAI", url: canonical("/compare/greenhouse-vs-recruitai"), description: "Compare Greenhouse vs RecruitAI on screening, bias control and ATS workflow.", publisher: { "@id": `${SITE_URL}/#organization` } },
      { "@context": "https://schema.org", ...breadcrumbJsonLd(crumbs.map(c => ({ name: c.name, url: canonical(c.href) }))) },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Compare • Greenhouse Alternative</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Greenhouse vs RecruitAI — keep your ATS, add intelligence.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              Greenhouse is excellent as a system of record. RecruitAI is the <strong className="text-foreground">screening intelligence it lacks</strong> — blind scoring, rubric calibration and sub-second semantic search. Most teams run them together, with RecruitAI scoring before Greenhouse records hires.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Try RecruitAI free</Link>
              <Link href="/features/ats-integration" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See Greenhouse export →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <section className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 bg-[#faf9f7] border-b border-border font-serif font-semibold text-sm">
            <div className="col-span-3 p-4 md:p-6 border-r border-border">Capability</div>
            <div className="col-span-4 p-4 md:p-6 border-r border-border text-muted">Greenhouse</div>
            <div className="col-span-5 p-4 md:p-6 text-accent flex items-center gap-2">RecruitAI <span className="text-[10px] font-sans font-bold bg-accent text-white px-2 py-0.5 rounded">Intelligence Layer</span></div>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.cap} className="grid grid-cols-12 text-sm">
                <div className="col-span-3 p-4 md:p-6 font-semibold border-r border-border/80 flex items-center">{r.cap}</div>
                <div className="col-span-4 p-4 md:p-6 text-muted border-r border-border/80 flex items-start gap-2"><span className="text-rose-500 font-bold">✕</span><span className="leading-relaxed">{r.greenhouse}</span></div>
                <div className="col-span-5 p-4 md:p-6 flex items-start gap-2 bg-accent/[0.03]"><span className="text-emerald-600 font-bold">✓</span><span className="leading-relaxed font-medium">{r.recruitai}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-border rounded-2xl p-8">
          <h2 className="font-serif text-2xl">Verdict: add RecruitAI, don’t rip out Greenhouse</h2>
          <p className="text-sm text-muted leading-relaxed mt-3 max-w-3xl">
            If your pain is top-of-funnel — hundreds of resumes, biased feedback, 15–20 hours per req — RecruitAI pays back immediately. If your pain is downstream (offer letters, background checks, headcount planning), keep Greenhouse. Enterprises often deploy RecruitAI inside Greenhouse workflow: candidate enters Greenhouse via API, RecruitAI scores blind, scorecard writes back as comment with rubric evidence, hiring manager reviews matrix. No re-platforming required.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Start Greenhouse pilot</Link>
            <Link href="/compare/lever-vs-recruitai" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">Lever vs RecruitAI →</Link>
          </div>
        </section>

        <section className="bg-[#F8F6F2] border border-border rounded-xl p-6">
          <h3 className="font-semibold text-sm">Further reading</h3>
          <ul className="mt-3 grid md:grid-cols-3 gap-3 text-sm">
            <li><Link href="/features/ai-resume-screening" className="text-accent hover:underline">AI Resume Screening →</Link><div className="text-xs text-muted">Why semantic beats Greenhouse keyword filters</div></li>
            <li><Link href="/features/blind-hiring" className="text-accent hover:underline">Blind Hiring →</Link><div className="text-xs text-muted">What Greenhouse can’t redact before scoring</div></li>
            <li><Link href="/guides/ats-guide" className="text-accent hover:underline">ATS Guide →</Link><div className="text-xs text-muted">Greenhouse payload schema inside</div></li>
          </ul>
        </section>
      </main>
      <Footer />
    </div>
  );
}
