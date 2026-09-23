import type { Metadata } from "next";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { InternalLinks, RelatedCTA } from "@/components/seo/InternalLinks";
import { buildMetadata, canonical, breadcrumbJsonLd, articleJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Candidate Screening Guide — Rubric Design & Interview Kits",
  description: "Candidate screening guide: design calibrated rubrics, run blind screening, create comparison matrices and generate gap-driven interview kits for fair, defensible hiring decisions.",
  path: "/guides/candidate-screening-guide",
  keywords: ["candidate screening guide","candidate evaluation guide","screening matrix","hiring rubric"],
  ogType: "article",
});

const published = "2026-04-20T00:00:00.000Z";
const modified = "2026-09-10T00:00:00.000Z";

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }, { name: "Candidate Screening Guide", href: "/guides/candidate-screening-guide" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      articleJsonLd({ headline: "Candidate Screening Guide — Rubric Design & Interview Kits", description: "Design rubrics, run blind screens, generate interview questions — handbook for hiring managers.", url: canonical("/guides/candidate-screening-guide"), datePublished: published, dateModified: modified }),
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
          <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Guide • Handbook</span>
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight mt-4">Candidate screening guide — rubrics, matrices and interview kits.</h1>
          <p className="text-sm text-muted mt-3">Published {new Date(published).toLocaleDateString()} • Updated {new Date(modified).toLocaleDateString()} • 15 min read</p>

          <div className="mt-8 space-y-8 text-sm leading-relaxed">
            <section>
              <h2 className="font-serif text-xl">1. Rubric design</h2>
              <p className="text-muted mt-3">Start from business outcomes, not adjectives. For a Staff Backend role: Architecture impact, Concurrency depth, Resilience, Communication, Velocity. Assign 1–5 scale per dimension and overall weight. RecruitAI auto-generates this from your JD; edit ±5% per pillar.</p>
              <div className="mt-3 bg-[#F8F6F2] border border-border rounded-xl p-4 text-xs font-mono text-muted">Example: Core Skills 30% • Architecture 25% • Problem Solving 20% • Communication 15% • Velocity 10%</div>
            </section>

            <section>
              <h2 className="font-serif text-xl">2. Matrix review</h2>
              <p className="text-muted mt-3">Overlay candidates on identical rubric. Use green ≥80% interview, amber 50–79% optional deep-dive, rose &lt;50% no-fit. Share PDF for committee alignment; note every decision for audit.</p>
            </section>

            <section>
              <h2 className="font-serif text-xl">3. Gap-driven interview kits</h2>
              <p className="text-muted mt-3">For each gap, RecruitAI suggests probe questions: e.g., for “limited GraphQL” → “Design a federated GraphQL layer for 5 microservices; tradeoffs vs REST?” This turns generic interviews into targeted evidence gathering.</p>
            </section>

            <InternalLinks groups={[
              { title: "Feature spine", links: [
                { label: "Candidate Screening Feature", href: "/features/ai-candidate-screening", description: "Product scoring workflow" },
                { label: "Blind Hiring Vectors", href: "/features/blind-hiring", description: "Ensure rubric is unbiased" },
                { label: "ATS Export", href: "/features/ats-integration", description: "Deliver matrix to hiring managers via ATS" },
              ]},
              { title: "More guides", links: [
                { label: "AI Recruiting Guide", href: "/guides/ai-recruiting-guide", description: "When to automate screening" },
                { label: "ATS Guide", href: "/guides/ats-guide", description: "Integration after screening" },
              ]},
            ]} />
          </div>
        </article>
        <div className="mt-8"><RelatedCTA title="Design your first rubric" description="Paste a JD. Get a calibrated 5-pillar rubric and blind scores instantly." href="/auth?tab=signup" label="Build Rubric Free" /></div>
      </div>
      <Footer />
    </div>
  );
}
