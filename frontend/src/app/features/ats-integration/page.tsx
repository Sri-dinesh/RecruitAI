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
  title: "ATS Integration — Greenhouse, Lever, Workday Export | RecruitAI",
  description: "ATS integration that exports blind-scored candidates to Greenhouse, Lever, Workday and Ashby as validated JSON/CSV with rubric scores, gaps and interview questions. One-click handoff, no re-entry.",
  path: "/features/ats-integration",
  keywords: ["ATS integration","Greenhouse ATS","Lever ATS","Workday recruiting","AI ATS","ATS export","Ashby ATS"],
});

const faq = [
  { question: "Which ATS platforms are supported?", answer: "Greenhouse, Lever, Workday and Ashby via validated JSON and CSV. Exports match their API schemas — no custom mapping required. Enterprise plans add bi-directional sync and webhook triggers." },
  { question: "What data is included in exports?", answer: "Candidate match score, matched skills with evidence, identified gaps, rubric breakdown, interview question suggestions and salary context where available — all validated via Pydantic." },
  { question: "Do we need to change our ATS workflow?", answer: "No. Export as spreadsheet or payload and import into your ATS; or use RecruitAI as the screening layer before candidates enter your ATS pipeline." },
  { question: "Is data kept in sync?", answer: "Trial accounts use 1-click exports. Enterprise plans support automated sync with rate-limited webhooks and idempotent upserts." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Features", href: "/features" }, { name: "ATS Integration", href: "/features/ats-integration" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: "RecruitAI — ATS Integration", url: canonical("/features/ats-integration"), applicationCategory: "BusinessApplication", publisher: { "@id": `${SITE_URL}/#organization` }, description: "AI ATS integration with Greenhouse, Lever, Workday export.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Interoperability • Greenhouse • Lever • Workday • Ashby</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Your ATS stays. RecruitAI makes it intelligent.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              RecruitAI is not an ATS replacement — it’s the <strong className="text-foreground">intelligence layer in front of your ATS</strong>. Scores, gaps and interview prompts flow into Greenhouse, Lever and Workday as validated JSON/CSV, with no re-keying and no glue code.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Export to your ATS</Link>
              <Link href="/features/ai-candidate-screening" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See scoring →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <section className="grid md:grid-cols-3 gap-4">
          {[
            { name: "Greenhouse", desc: "Candidate & scorecard payloads with source-cited skill matches." },
            { name: "Lever", desc: "Opportunity staging with rubric breakdowns and interview kits." },
            { name: "Workday / Ashby", desc: "Enterprise-ready CSV/JSON with human-readable gaps & audit notes." },
          ].map((ats) => (
            <div key={ats.name} className="bg-white border border-border rounded-xl p-5">
              <div className="text-sm font-semibold">{ats.name}</div>
              <p className="text-sm text-muted leading-relaxed mt-2">{ats.desc}</p>
              <span className="inline-flex mt-3 text-xs font-semibold bg-accent/10 text-accent border border-accent/15 rounded-full px-2.5 py-1">Validated schema ✓</span>
            </div>
          ))}
        </section>

        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl">What’s inside each export</h2>
            <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
              <ul className="space-y-2">
                {["Candidate reference ID & role title","Alignment score (0–100) with tier color","Skills verified with evidence snippets","Rubric dimension breakdown (Architecture, Concurrency, etc.)"].map((t) => (
                  <li key={t} className="flex gap-2.5 bg-[#F8F6F2] border border-border rounded-lg px-4 py-3"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">{t}</span></li>
                ))}
              </ul>
              <ul className="space-y-2">
                {["Identified gaps & red flags","Generated interview question kit","Salary context & market band (Tavily-powered)","Compliance disclaimer + blind screening badge"].map((t) => (
                  <li key={t} className="flex gap-2.5 bg-white border border-border rounded-lg px-4 py-3"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">{t}</span></li>
                ))}
              </ul>
            </div>
            <pre className="mt-6 bg-[#111111] text-[#f8f8f2] rounded-xl p-6 overflow-x-auto text-xs leading-relaxed">
{`{
  "candidate_ref": "CAN-8420-DISTRIB",
  "role_title": "Staff Backend Engineer",
  "alignment_score": 0.96,
  "blind_screening": true,
  "skills_verified": ["Rust / Tokio", "Raft Consensus", "Kafka / ClickHouse"],
  "rubric_assessment": { "architecture_impact": 5.0, "concurrency_depth": 4.9 },
  "status": "Shortlisted — Ready for Human Confirm"
}`}
            </pre>
          </section>

          <section>
            <h2 className="font-serif text-2xl">FAQ — ATS integration</h2>
            <div className="mt-4 space-y-3">
              {faq.map((f) => (
                <details key={f.question} className="group border border-border rounded-xl bg-[#faf9f7] px-5 py-4 open:bg-white">
                  <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">{f.question}<span className="text-muted group-open:rotate-180 transition-transform">▾</span></summary>
                  <p className="text-sm text-muted leading-relaxed mt-3">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <InternalLinks groups={[
            { title: "Upstream capabilities", links: [
              { label: "AI Resume Screening", href: "/features/ai-resume-screening", description: "What gets exported starts as parsed resumes" },
              { label: "Candidate Screening", href: "/features/ai-candidate-screening", description: "Rubric that powers scorecards" },
              { label: "Recruitment Automation", href: "/features/recruitment-automation", description: "End-to-end orchestrated pipeline" },
            ]},
            { title: "See comparisons", links: [
              { label: "Greenhouse vs RecruitAI", href: "/compare/greenhouse-vs-recruitai", description: "Head-to-head automation gains" },
              { label: "Lever vs RecruitAI", href: "/compare/lever-vs-recruitai", description: "Where Lever lacks blind scoring" },
              { label: "Pricing & Plans", href: "/pricing", description: "Export limits per plan" },
            ]},
          ]} />
        </article>
        <RelatedCTA title="Push your next shortlist to Greenhouse in 1 click" description="No CSV gymnastics — RecruitAI formats payloads to match ATS schemas automatically." href="/auth?tab=signup" label="Start Exporting Free" />
      </main>
      <Footer />
    </div>
  );
}
