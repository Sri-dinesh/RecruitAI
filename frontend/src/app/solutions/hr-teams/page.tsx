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
  title: "Recruiting Software for HR Teams & Recruiters — AI Co-Pilot",
  description: "Recruiting software for HR teams: AI co-pilot for screening, outreach, interview kits and analytics — side-by-side matrices and human-approved email drafts let recruiters ship 10x more pipelines.",
  path: "/solutions/hr-teams",
  keywords: ["recruiting software for HR","HR recruiting software","recruiter AI assistant","hiring manager tool","talent acquisition software"],
});

const faq = [
  { question: "Will this replace recruiter judgment?", answer: "It amplifies judgment. Scores are evidence-backed and consistent, but recruiters choose shortlist, interview depth and final offers. The AI never auto-rejects or auto-hires." },
  { question: "How does it handle hiring manager feedback?", answer: "Share the matrix and interview kit; managers comment on gaps and priorities, and the recruiter re-weights rubric dimensions for the next batch — all logged." },
  { question: "Can we customize outreach per hiring manager voice?", answer: "Yes. Drafts cite candidate projects and role context; recruiters edit tone before 1-click confirm. Templates are stored per campaign for consistency." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions/hr-teams" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: "RecruitAI — For HR Teams", url: canonical("/solutions/hr-teams"), applicationCategory: "BusinessApplication", publisher: { "@id": `${SITE_URL}/#organization` }, description: "AI co-pilot for recruiters and HR teams.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Solutions • HR Teams • Recruiters • Hiring Managers</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">A co-pilot that lets recruiters ship 10x more pipelines.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              RecruitAI sits between inbox, ATS and hiring managers — giving talent partners <strong className="text-foreground">objective matrices, interview kits and approved outreach</strong> without 20 hours per req in spreadsheets.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Start co-piloting</Link>
              <Link href="/features/ai-candidate-screening" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See matrices →</Link>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl">Day in the life, before vs after</h2>
            <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
              <div className="border border-border rounded-xl p-5">
                <div className="font-semibold">Before: recruiter treadmill</div>
                <ul className="mt-2 list-disc pl-5 text-muted space-y-1 leading-relaxed">
                  <li>Open 80 PDFs, memorize job criteria, skim for keywords</li>
                  <li>Subjective scoring drifts across 3 interviewers</li>
                  <li>Copy-paste emails; hiring managers ask “why this candidate?”</li>
                </ul>
              </div>
              <div className="border border-accent/20 bg-accent/5 rounded-xl p-5">
                <div className="font-semibold">After: co-pilot workflow</div>
                <ul className="mt-2 list-disc pl-5 text-muted space-y-1 leading-relaxed">
                  <li>Paste JD → drop PDFs → rubric + scores ready</li>
                  <li>Blind mode eliminates name/photo bias at top-of-funnel</li>
                  <li>Share matrix + interview questions; hiring managers align in one review</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">Built for collaboration</h2>
            <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
              {[
                { t: "Matrix sharing", d: "Color-coded fit tiers (green/amber/rose) let hiring managers grasp shortlists in seconds." },
                { t: "Question kits", d: "Generated probes fill gaps — e.g., ‘Describe a K8s incident you debugged end-to-end.’" },
                { t: "Analytics for managers", d: "Pipeline velocity, screening distribution and activity feed keep leaders informed." },
              ].map((c) => (
                <div key={c.t} className="border border-border rounded-xl p-5 bg-[#F8F6F2]">
                  <div className="font-semibold">{c.t}</div>
                  <p className="text-muted leading-relaxed mt-2">{c.d}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">FAQ</h2>
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
            { title: "Feature enablers", links: [
              { label: "AI Resume Screening", href: "/features/ai-resume-screening", description: "Remove skimming toil" },
              { label: "Recruitment Automation", href: "/features/recruitment-automation", description: "LangGraph agents assist, not replace" },
              { label: "Blind Hiring", href: "/features/blind-hiring", description: "Keep early funnel fair" },
            ]},
            { title: "Learn more", links: [
              { label: "Candidate Screening Guide", href: "/guides/candidate-screening-guide", description: "Handbook for HR teams" },
              { label: "Pricing", href: "/pricing", description: "Per seat vs per evaluation" },
              { label: "Tech Hiring Solution", href: "/solutions/tech-hiring", description: "When hiring managers are eng leads" },
            ]},
          ]} />
        </article>
        <RelatedCTA title="Give recruiters their time back" description="Cut 20 hours to 20 minutes per requisition — without cutting corners on fairness." href="/auth?tab=signup" label="Start HR Co-Pilot" />
      </main>
      <Footer />
    </div>
  );
}
