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
  title: "Recruitment Automation Software — AI Orchestrated Hiring Workflows",
  description: "Recruitment automation software using LangGraph multi-agent orchestration: JD parsing, resume scoring, interview kit generation and outreach drafting — with human-in-the-loop approvals and audit logs.",
  path: "/features/recruitment-automation",
  keywords: ["recruitment automation","hiring automation","recruiting automation software","AI recruiting automation","talent automation"],
});

const faq = [
  { question: "Does automation replace recruiters?", answer: "No. RecruitAI automates the repetitive 80% (parsing, scoring, draft generation) and reserves the 20% that requires judgment (final interview, offer decisions, reveals) for humans. Every outbound action is gated behind explicit confirmation." },
  { question: "What agents handle each step?", answer: "Supervisor routes intent → JD Agent structures job requirements → Screening/RAG agent performs vector retrieval and scoring → Interview/Salary agent drafts questions and outreach → HITL Confirm gate halts before sending." },
  { question: "How is quality ensured?", answer: "Structured Pydantic schemas, multi-agent cross-checks, confidence thresholds (<0.60 routes to fallback with quick-action options), and full audit logging." },
  { question: "Can we run automation on mobile?", answer: "Yes. The Expo mobile app mirrors web workflows with offline mutation queuing, push approvals for emails and interview bookings, and analytics dashboards." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Features", href: "/features" }, { name: "Recruitment Automation", href: "/features/recruitment-automation" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: "RecruitAI — Recruitment Automation", url: canonical("/features/recruitment-automation"), applicationCategory: "BusinessApplication", publisher: { "@id": `${SITE_URL}/#organization` }, description: "Recruitment automation with LangGraph agents and human-in-the-loop controls.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">LangGraph Multi-Agent • Human-in-the-Loop</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Automate the pipeline. Keep human judgment in charge.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              RecruitAI coordinates <strong className="text-foreground">specialized LangGraph agents</strong> for JD ingestion, screening, interview-question generation and outreach — so recruiters handle exceptions and approvals, not copy-paste.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Automate a campaign</Link>
              <Link href="/features/ai-candidate-screening" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See scoring inside →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl">The agentic workflow — five agents, one audit trail</h2>
            <div className="mt-4 grid md:grid-cols-5 gap-3 text-sm">
              {[
                { n: "Supervisor", d: "Intent classification, pronoun resolution, turn routing with confidence thresholds" },
                { n: "JD Agent", d: "Parses job descriptions into structured rubrics, validates skills" },
                { n: "Screening Agent", d: "pgvector retrieval, rubric scoring, gap & red-flag detection" },
                { n: "Interview Agent", d: "Generates tailored technical questions & outreach drafts" },
                { n: "HITL Gate", d: "Halts email sends and calendar locks pending explicit human confirm" },
              ].map((a, i) => (
                <div key={a.n} className="border border-border rounded-xl p-4 bg-[#F8F6F2]">
                  <div className="text-xs font-bold tracking-widest uppercase text-accent">Agent {i + 1}</div>
                  <div className="font-semibold mt-1">{a.n}</div>
                  <p className="text-xs text-muted leading-relaxed mt-2">{a.d}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">What automation actually does</h2>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div className="border border-border rounded-xl p-5">
                <h3 className="font-semibold">Before RecruitAI (manual)</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted space-y-1 leading-relaxed">
                  <li>Circadian fatigue reading 200 PDFs</li>
                  <li>Spreadsheet scoring with ±30% variance across interviewers</li>
                  <li>Generic mass-blast emails with &lt;5% reply rate</li>
                  <li>No traceability for compliance or bias audits</li>
                </ul>
              </div>
              <div className="border border-accent/20 bg-accent/5 rounded-xl p-5">
                <h3 className="font-semibold">With RecruitAI (automated)</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted space-y-1 leading-relaxed">
                  <li>Semantic ranking in minutes, same rubric for all candidates</li>
                  <li>Deterministic scorecards with evidence citations</li>
                  <li>Personalized outreach drafts citing projects — 1-click approve</li>
                  <li>Timestamped audit log + bias-impact reporting ready for review</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">FAQ — Recruitment automation</h2>
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
            { title: "Dive deeper", links: [
              { label: "How resume screening works", href: "/features/ai-resume-screening", description: "Parsing layer behind automation" },
              { label: "Blind hiring guardrails", href: "/features/blind-hiring", description: "Unbiased scoring inside automated flows" },
              { label: "ATS handoff", href: "/features/ats-integration", description: "Where automation hands off to your ATS" },
            ]},
            { title: "Use cases", links: [
              { label: "Tech Hiring Solution", href: "/solutions/tech-hiring", description: "Scale engineering pipelines 10x" },
              { label: "HR Teams Solution", href: "/solutions/hr-teams", description: "From intake to offer without burnout" },
              { label: "AI Recruiting Guide", href: "/guides/ai-recruiting-guide", description: "When to automate vs. keep human" },
            ]},
          ]} />
        </article>
        <RelatedCTA title="Automate your next requisition" description="Bring JD + resumes. Let agents score and draft — you approve sends and lock calendars." href="/auth?tab=signup" label="Start Automating Free" />
      </main>
      <Footer />
    </div>
  );
}
