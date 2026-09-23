import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { InternalLinks, RelatedCTA } from "@/components/seo/InternalLinks";
import { buildMetadata, canonical, organizationJsonLd, softwareApplicationJsonLd, websiteJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "AI Recruiting Features — Resume Screening, Blind Hiring & ATS Automation",
  description: "Explore RecruitAI’s AI recruiting features: automated resume screening, blind hiring, candidate matching, recruitment analytics and ATS-ready exports. See how each module replaces manual screening.",
  path: "/features",
  keywords: ["AI recruiting features","recruitment automation features","AI hiring platform features","candidate screening features"],
});

const features = [
  {
    href: "/features/ai-resume-screening",
    label: "AI Resume Screening",
    desc: "Parse PDFs, DOCX and text in 1.4s per file, convert to pgvector embeddings and surface top matches semantically — not by keyword fluff.",
    intent: "AI resume screening · resume screening automation",
  },
  {
    href: "/features/ai-candidate-screening",
    label: "AI Candidate Screening",
    desc: "Multi-dimensional rubric scoring derived from your JD, with side-by-side candidate matrices and gap analysis.",
    intent: "AI candidate screening · screening software",
  },
  {
    href: "/features/blind-hiring",
    label: "Blind Hiring & Unbiased Screening",
    desc: "PII redaction before LLM scoring eliminates demographic bias and restores purely skill-driven evaluation.",
    intent: "blind hiring · unbiased hiring platform",
  },
  {
    href: "/features/ats-integration",
    label: "ATS Integration",
    desc: "One-click JSON/CSV exports formatted for Greenhouse, Lever, Workday and Ashby — no glue code needed.",
    intent: "ATS integration · AI ATS",
  },
  {
    href: "/features/recruitment-automation",
    label: "Recruitment Automation",
    desc: "Multi-agent LangGraph orchestration automates intake, scoring, interview drafts and hire-ready reports requiring only human confirmation.",
    intent: "recruitment automation · AI recruiting software",
  },
];

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Features", item: canonical("/features") },
  ],
};

const softwareLd = {
  "@context": "https://schema.org",
  ...softwareApplicationJsonLd(),
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={breadcrumbLd} />
      <SingleJsonLd data={{ "@context": "https://schema.org", "@graph": [organizationJsonLd(), websiteJsonLd(), softwareLd] }} />
      <MarketingNav />

      <header className="border-b border-border bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-10">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Features", href: "/features" }]} />
          <div className="mt-4 max-w-3xl">
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Platform • Feature Hub</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Every AI recruiting capability, built to replace manual screening.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              RecruitAI replaces spreadsheets and keyword filters with deterministic, audited automation. Each feature below is a standalone search-worthy capability — pick the workflow you need, or use them as an end-to-end platform.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-mono text-muted">
              <span className="bg-[#F8F6F2] border border-border rounded-full px-3 py-1.5">AI resume screening</span>
              <span className="bg-[#F8F6F2] border border-border rounded-full px-3 py-1.5">Blind hiring</span>
              <span className="bg-[#F8F6F2] border border-border rounded-full px-3 py-1.5">ATS export</span>
              <span className="bg-white border border-border rounded-full px-3 py-1.5">Human-in-the-loop ✓</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-12">
        {/* Feature grid — each card is an SEO doorway with internal link + intent */}
        <section aria-labelledby="feature-grid">
          <h2 id="feature-grid" className="sr-only">Feature Index</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f) => (
              <Link key={f.href} href={f.href} className="group bg-white border border-border rounded-2xl p-6 hover:border-accent/30 hover:shadow-sm transition-all">
                <div className="text-[11px] font-semibold tracking-widest uppercase text-accent">{f.intent}</div>
                <h3 className="font-serif text-xl mt-2 group-hover:text-accent transition-colors">{f.label}</h3>
                <p className="text-sm text-muted leading-relaxed mt-2">{f.desc}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent mt-4">Explore →</span>
              </Link>
            ))}
          </div>
        </section>

        {/* How they connect */}
        <section className="bg-white border border-border rounded-2xl p-8">
          <h2 className="font-serif text-2xl">How the features work together</h2>
          <p className="text-sm text-muted leading-relaxed mt-2 max-w-3xl">
            Upload job descriptions and resumes → <strong className="text-foreground">AI resume screening</strong> vectorizes candidates → <strong className="text-foreground">AI candidate screening</strong> scores against your rubric → <strong className="text-foreground">Blind hiring</strong> removes PII before evaluation → <strong className="text-foreground">ATS integration</strong> exports hire-ready payloads. Human approval gates every outbound email and calendar hold.
          </p>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            {["Ingest & Parse", "Vectorize (pgvector)", "Blind Redaction", "Rubric Scoring", "Export to ATS"].map((step, i) => (
              <div key={step} className="bg-[#F8F6F2] border border-border rounded-xl px-3 py-3 text-center">
                <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold mx-auto">{i + 1}</div>
                <div className="font-semibold text-foreground mt-2">{step}</div>
              </div>
            ))}
          </div>
        </section>

        <InternalLinks
          groups={[
            {
              title: "By intent — jump directly",
              links: [
                { label: "AI Resume Screening", href: "/features/ai-resume-screening", description: "For teams drowning in resumes; 1.4s per PDF parsing" },
                { label: "Blind Hiring Platform", href: "/features/blind-hiring", description: "Eliminate name, photo and location bias" },
                { label: "Recruitment Automation", href: "/features/recruitment-automation", description: "LangGraph multi-agent orchestration" },
              ],
            },
            {
              title: "Solutions for your team",
              links: [
                { label: "For Startups", href: "/solutions/startups", description: "Hire the first 50 with zero overhead" },
                { label: "For Enterprise", href: "/solutions/enterprise", description: "Audit-ready reporting & RLS isolation" },
                { label: "For HR Teams & Recruiters", href: "/solutions/hr-teams", description: "Co-pilot for busy talent partners" },
              ],
            },
          ]}
        />

        <RelatedCTA
          title="Start screening free — no credit card"
          description="Upload a job description and 5 resumes in under 2 minutes. See objective scores with blind mode enabled."
          href="/auth?tab=signup"
          label="Start Free"
        />
      </main>

      <Footer />
    </div>
  );
}
