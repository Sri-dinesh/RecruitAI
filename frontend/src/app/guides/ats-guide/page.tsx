import type { Metadata } from "next";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { InternalLinks, RelatedCTA } from "@/components/seo/InternalLinks";
import { buildMetadata, canonical, breadcrumbJsonLd, articleJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "ATS Guide — Greenhouse, Lever & Workday Integration Playbook",
  description: "ATS guide: Greenhouse vs Lever vs Workday exports, validated JSON/CSV schemas, webhook sync vs spreadsheet handoff and rollout checklist for talent ops.",
  path: "/guides/ats-guide",
  keywords: ["ATS guide","Greenhouse integration guide","Lever ATS guide","Workday recruiting guide","applicant tracking system guide"],
  ogType: "article",
});

const published = "2026-05-10T00:00:00.000Z";
const modified = "2026-09-10T00:00:00.000Z";

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: "ATS Guide", href: "/guides/ats-guide" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      articleJsonLd({ headline: "ATS Guide — Greenhouse, Lever & Workday Integration Playbook", description: "ATS integration patterns, payload schemas and rollout checklist.", url: canonical("/guides/ats-guide"), datePublished: published, dateModified: modified }),
      { "@context": "https://schema.org", ...breadcrumbJsonLd(crumbs.map(c => ({ name: c.name, url: canonical(c.href) }))) },
    ],
  };
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={ld} />
      <MarketingNav />
      <div className="max-w-4xl mx-auto px-6 md:px-8 py-10">
        <Breadcrumbs items={crumbs} />
        <article className="mt-6 bg-white border border-border rounded-2xl p-8 md:p-10">
          <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Guide • Integration</span>
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight mt-4">ATS guide — make Greenhouse, Lever and Workday accept intelligent scorecards.</h1>
          <p className="text-sm text-muted mt-3">Published {new Date(published).toLocaleDateString()} • Updated {new Date(modified).toLocaleDateString()} • 11 min read</p>

          <div className="mt-8 space-y-8 text-sm leading-relaxed">
            <section>
              <h2 className="font-serif text-xl">1. Handoff models</h2>
              <div className="mt-3 grid md:grid-cols-2 gap-4">
                <div className="border border-border rounded-xl p-5 bg-[#F8F6F2]"><div className="font-semibold">Spreadsheet & JSON export</div><p className="text-muted text-xs mt-1 leading-relaxed">Good for trials and startups. One-click CSV with candidate_ref, score, skills_with_evidence, gaps. Paste into ATS or import via bulk tool.</p></div>
                <div className="border border-border rounded-xl p-5"><div className="font-semibold">Webhook sync (enterprise)</div><p className="text-muted text-xs mt-1 leading-relaxed">Idempotent upserts on opportunity creation; retry with exponential backoff; reflect blind_screened flags and interview kits in ATS scorecards.</p></div>
              </div>
            </section>

            <section>
              <h2 className="font-serif text-xl">2. What payloads contain</h2>
              <pre className="mt-3 bg-[#111111] text-[#f8f8f2] rounded-xl p-6 text-xs overflow-x-auto leading-relaxed">{`{
  "candidate_ref": "CAN-8420",
  "role": "Staff Backend Engineer",
  "alignment_score": 0.96,
  "blind_screening": true,
  "skills_verified": ["Rust / Tokio", "Raft", "Kafka / ClickHouse"],
  "rubric": { "architecture_impact": 5.0, "concurrency_depth": 4.9 },
  "interview_kit": ["Design Raft failure recovery", "Tune Postgres for 150k DAU"],
  "source_citations": ["resume chunk 3: led K8s migration..."]
}`}</pre>
              <p className="text-muted mt-3">All fields are Pydantic-validated; missing required ATS fields block export before you send bad data downstream.</p>
            </section>

            <section>
              <h2 className="font-serif text-xl">3. Rollout steps</h2>
              <ol className="mt-3 list-decimal pl-5 text-muted space-y-1">
                <li>Map RecruitAI candidate_ref → ATS opportunity custom field.</li>
                <li>Pilot with one requisition; verify Greenhouse scorecard appears as comment + tag.</li>
                <li>Enable webhook for auto-sync; monitor 2 weeks before retiring manual ATS scoring.</li>
              </ol>
            </section>

            <InternalLinks groups={[
              { title: "Feature spine", links: [
                { label: "ATS Integration Feature", href: "/features/ats-integration", description: "See validated schemas live" },
                { label: "Recruitment Automation", href: "/features/recruitment-automation", description: "Where export fits in orchestrated workflow" },
              ]},
              { title: "Comparisons", links: [
                { label: "Greenhouse vs RecruitAI", href: "/compare/greenhouse-vs-recruitai", description: "Where Greenhouse lacks blind scoring" },
                { label: "Lever vs RecruitAI", href: "/compare/lever-vs-recruitai", description: "Lever alternative focused on intelligence" },
              ]},
            ]} />
          </div>
        </article>
        <div className="mt-8"><RelatedCTA title="Export to your ATS this week" description="Score one role and ship Greenhouse/Lever-ready payloads — no ATS migration." href="/auth?tab=signup" label="Export to ATS" /></div>
      </div>
      <Footer />
    </div>
  );
}
