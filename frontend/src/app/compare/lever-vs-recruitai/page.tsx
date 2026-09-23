import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { buildMetadata, canonical, breadcrumbJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "Lever vs RecruitAI — AI Recruiting Alternative for Modern Pipelines",
  description: "Compare Lever vs RecruitAI: sourcing-centric ATS vs AI screening intelligence with blind hiring, rubric scoring and instant candidate matching. Keep Lever as record, add RecruitAI as intelligence layer.",
  path: "/compare/lever-vs-recruitai",
  keywords: ["Lever vs RecruitAI","Lever alternative","Lever ATS comparison","Lever ATS vs AI recruiting"],
});

const rows = [
  { cap: "Focus", lever: "Candidate sourcing, CRM and pipeline organization; limited scoring depth.", recruitai: "Evaluation intelligence — semantic ranking, blind rubric scoring, gap & interview kit generation." },
  { cap: "Screening automation", lever: "Manual stages and tags; reports rely on human-entered feedback.", recruitai: "Autonomous LangGraph agents ingest, vectorize and score 500+ resumes in minutes." },
  { cap: "Blind hiring", lever: "No native PII redaction before review; demographic leakage persists.", recruitai: "Pre-scoring redaction proves skill-only evaluation; per-campaign toggle and audit logging." },
  { cap: "Scoring consistency", lever: "Hiring manager notes vary wildly in format and rigor.", recruitai: "Deterministic matrices with evidence-cited skills; shared PDFs align hiring committees." },
  { cap: "Integration story", lever: "Core system; add-ons via marketplace but gaps in scoring intelligence.", recruitai: "Complements Lever — validated Lever-ready exports, mobile approvals, analytics feed." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Compare", href: "/compare/lever-vs-recruitai" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "Lever vs RecruitAI", url: canonical("/compare/lever-vs-recruitai"), description: "Compare Lever vs RecruitAI.", publisher: { "@id": `${SITE_URL}/#organization` } },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Compare • Lever Alternative</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Lever vs RecruitAI — intelligence on top of your CRM.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              Lever organizes pipelines; RecruitAI <strong className="text-foreground">decides who belongs at the top of that pipeline</strong> with calibrated, blind, evidence-backed scoring. Most teams keep Lever as the CRM and run RecruitAI as the scoring engine.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Try RecruitAI free</Link>
              <Link href="/features/ats-integration" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See Lever export →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <section className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 bg-[#faf9f7] border-b border-border font-serif font-semibold text-sm">
            <div className="col-span-3 p-4 md:p-6 border-r border-border">Capability</div>
            <div className="col-span-4 p-4 md:p-6 border-r border-border text-muted">Lever</div>
            <div className="col-span-5 p-4 md:p-6 text-accent flex items-center gap-2">RecruitAI <span className="text-[10px] font-sans font-bold bg-accent text-white px-2 py-0.5 rounded">Scoring Engine</span></div>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.cap} className="grid grid-cols-12 text-sm">
                <div className="col-span-3 p-4 md:p-6 font-semibold border-r border-border/80">{r.cap}</div>
                <div className="col-span-4 p-4 md:p-6 text-muted border-r border-border/80 flex gap-2"><span className="text-rose-500 font-bold">✕</span><span className="leading-relaxed">{r.lever}</span></div>
                <div className="col-span-5 p-4 md:p-6 flex gap-2 bg-accent/[0.03]"><span className="text-emerald-600 font-bold">✓</span><span className="leading-relaxed font-medium">{r.recruitai}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-border rounded-2xl p-8">
          <h2 className="font-serif text-2xl">Verdict: add scoring to your CRM</h2>
          <p className="text-sm text-muted leading-relaxed mt-3 max-w-3xl">
            If your pain is sourcing volume and pipeline fairness, RecruitAI solves what Lever never attempted: blind, calibrated screening. Keep Lever for candidate relationship history and pipeline visualization; let RecruitAI deliver matrices, interview kits and outreach drafts that update Lever opportunities as comments. Together they behave like an AI-native ATS.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Start Lever pilot</Link>
            <Link href="/compare/greenhouse-vs-recruitai" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">Greenhouse vs RecruitAI →</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
