import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { InternalLinks, RelatedCTA } from "@/components/seo/InternalLinks";
import { buildMetadata, canonical, breadcrumbJsonLd, faqJsonLd, articleJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "AI Recruiting Guide — When & How to Automate Hiring Responsibly",
  description: "AI recruiting guide covering LangGraph orchestration, human-in-the-loop safeguards, blind hiring compliance and rollout checklist. Automation map for HR teams, startups and enterprises.",
  path: "/guides/ai-recruiting-guide",
  keywords: ["AI recruiting guide","AI recruitment guide","hiring automation guide","recruitment automation playbook"],
  ogType: "article",
});

const published = "2026-03-15T00:00:00.000Z";
const modified = "2026-09-10T00:00:00.000Z";

const faq = [
  { question: "Should we automate everything?", answer: "No. Automate intake, parsing, ranking and draft creation; keep final interviews, compensation decisions and culture checks human. The highest ROI roles to automate are top-of-funnel where volume creates bias and fatigue." },
  { question: "How do we win legal’s approval?", answer: "Show three artifacts: (1) blind redaction pre-scoring, (2) audit-logged scores with impact-ratio reporting, (3) HITL gates that block autonomous sends. RecruitAI generates all three by default." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: "AI Recruiting Guide", href: "/guides/ai-recruiting-guide" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      articleJsonLd({ headline: "AI Recruiting Guide — When & How to Automate Hiring Responsibly", description: "When to automate, when to keep human judgment, and how to roll out AI recruiting.", url: canonical("/guides/ai-recruiting-guide"), datePublished: published, dateModified: modified }),
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
          <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Guide • Strategy</span>
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight mt-4">AI recruiting guide — automate the 80%, protect the 20%.</h1>
          <p className="text-sm text-muted mt-3">Published {new Date(published).toLocaleDateString()} • Updated {new Date(modified).toLocaleDateString()} • 12 min read</p>

          <div className="mt-8 space-y-8 text-sm leading-relaxed">
            <section>
              <h2 className="font-serif text-xl">1. The automation map</h2>
              <p className="text-muted mt-2">Top-of-funnel tasks consume 60–70% of recruiter time yet create minimal differentiation: opening PDFs, memorizing JD, context switching. Those are where AI ROI is highest. Leave nuanced judgment — final interviews and offer trade-offs — human.</p>
              <ul className="mt-3 list-disc pl-5 text-muted space-y-1">
                <li><strong className="text-foreground">Automate:</strong> JD structuring, resume chunking, vector search, rubric scoring, outreach drafts, interview question generation</li>
                <li><strong className="text-foreground">Keep human:</strong> Candidate shortlist approval, culture interviews, compensation, final offers, bias oversight</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-xl">2. Guardrails before rollout</h2>
              <div className="mt-3 grid md:grid-cols-3 gap-4">
                <div className="border border-border rounded-xl p-4 bg-[#F8F6F2]"><div className="font-semibold">Blind hiring on</div><p className="text-muted text-xs mt-1 leading-relaxed">Redact PII before scoring for top-of-funnel — protects against legal exposure and restores merit signal.</p></div>
                <div className="border border-border rounded-xl p-4"><div className="font-semibold">Audit log on</div><p className="text-muted text-xs mt-1 leading-relaxed">Timestamp every score and status change. Export dossiers for hiring committee review.</p></div>
                <div className="border border-border rounded-xl p-4"><div className="font-semibold">HITL gate on</div><p className="text-muted text-xs mt-1 leading-relaxed">No draft leaves without “Confirm.” This is your Article 22 alignment and candidate experience safety net.</p></div>
              </div>
            </section>

            <section>
              <h2 className="font-serif text-xl">3. Rollout checklist (30/60/90)</h2>
              <ol className="mt-3 list-decimal pl-5 text-muted space-y-1">
                <li><strong className="text-foreground">Days 1–30:</strong> Run one role with RecruitAI alongside existing ATS; compare shortlist overlap and time-to-screen.</li>
                <li><strong className="text-foreground">Days 31–60:</strong> Enable blind mode on two requisitions; measure impact ratio shift and hiring manager satisfaction.</li>
                <li><strong className="text-foreground">Days 61–90:</strong> Push scored shortlists to ATS via validated export; turn ATS into downstream system of record, not screening engine.</li>
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
              { title: "Guides", links: [
                { label: "Resume Screening Guide", href: "/guides/resume-screening-guide", description: "Parsing & calibration in detail" },
                { label: "Candidate Screening Guide", href: "/guides/candidate-screening-guide", description: "Rubric design deep dive" },
                { label: "ATS Guide", href: "/guides/ats-guide", description: "Where automation hands off" },
              ]},
              { title: "Start automating", links: [
                { label: "Recruitment Automation Feature", href: "/features/recruitment-automation", description: "LangGraph orchestration in product" },
                { label: "Tech Hiring Solution", href: "/solutions/tech-hiring", description: "Eng-specific pipeline scaling" },
              ]},
            ]} />
          </div>
        </article>

        <div className="mt-8">
          <RelatedCTA title="Put this guide into practice" description="Create a campaign and run the 30-day parallel screen. See same role, two workflows side-by-side." href="/auth?tab=signup" label="Start 30-Day Trial" />
        </div>
      </div>
      <Footer />
    </div>
  );
}
