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
  title: "Tech Hiring Software — AI Recruiting for Engineering Teams",
  description: "Tech hiring software for engineering: AI resume screening, blind code evaluation, Kubernetes/React/Python scoring matrices and Greenhouse-ready exports. Hire developers 10x faster with rubric intelligence.",
  path: "/solutions/tech-hiring",
  keywords: ["tech hiring software","engineering hiring","hire developers AI","technical recruiting software","AI hiring for engineers"],
});

const faq = [
  { question: "Can it evaluate non-engineering roles?", answer: "Yes. Rubrics are generated from any JD — product, design, data, GTM — but tech hiring is our sweet spot with the deepest evaluation dimensions for languages, infra and architecture impact." },
  { question: "How does it handle stack-specific nuance?", answer: "Screening matches semantics, not acronyms: ‘distributed consensus’ finds Raft/Paxos/ZooKeeper experience; ‘high-throughput APIs’ matches scale numbers and latency improvements — not just ‘API’ keyword presence." },
  { question: "Is blind screening safe for eng hiring?", answer: "Critical. Studies show resume prestige signals distort technical assessments. Blind mode ensures scores reflect delivered systems, not university or past employer branding." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions/tech-hiring" }, { name: "Tech Hiring", href: "/solutions/tech-hiring" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: "RecruitAI — Tech Hiring", url: canonical("/solutions/tech-hiring"), applicationCategory: "BusinessApplication", publisher: { "@id": `${SITE_URL}/#organization` }, description: "AI recruiting for engineering teams with rubric scoring and blind evaluation.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Solutions • Engineering & Technical Hiring</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Tech hiring without keyword roulette.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              RecruitAI scores engineers on <strong className="text-foreground">built systems, not buzzwords</strong> — distributed systems, concurrency depth, K8s/cloud-native patterns and architecture leadership — blind, calibrated, and exportable to your ATS.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Hire engineers free</Link>
              <Link href="/features/ai-candidate-screening" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See rubric scoring →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl">Why engineering teams switch to RecruitAI</h2>
            <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
              <div className="border border-border rounded-xl p-5">
                <div className="font-semibold">Architecture depth, not icons</div>
                <p className="text-muted leading-relaxed mt-2">Evaluates Raft, Kafka/ClickHouse, Kubernetes operators, Rust Tokio — with evidence quotes from resumes, not checkbox presence.</p>
              </div>
              <div className="border border-border rounded-xl p-5">
                <div className="font-semibold">Interview kits that save staff time</div>
                <p className="text-muted leading-relaxed mt-2">Auto-generates probing questions tailored to candidate gaps — e.g., “Walk through your index tuning decisions for 150k DAU Postgres cluster.”</p>
              </div>
              <div className="border border-border rounded-xl p-5">
                <div className="font-semibold">Sub-second ranking for 500+ applicants</div>
                <p className="text-muted leading-relaxed mt-2">31ms pgvector retrieval turns top-of-funnel from days to minutes — staff review only top decile.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">Stacks we evaluate deeply</h2>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {["React / Next.js","Node.js / TypeScript","Python / Django / FastAPI","Rust / Go","PostgreSQL / Redis","Kafka / ClickHouse","Kubernetes / Docker","AWS / GCP","ML / Embeddings","LangGraph / LLM Apps"].map((s) => (
                <span key={s} className="bg-[#F8F6F2] border border-border rounded-full px-3 py-1.5 text-muted">{s}</span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">FAQ — Tech hiring</h2>
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
            { title: "Feature deep dives", links: [
              { label: "AI Resume Screening for Tech", href: "/features/ai-resume-screening", description: "Parse engineering resumes semantically" },
              { label: "Blind Hiring Vectors", href: "/features/blind-hiring", description: "Score code depth without prestige bias" },
              { label: "Recruitment Analytics", href: "/features/recruitment-automation", description: "Pipeline velocity for eng managers" },
            ]},
            { title: "Alternative paths", links: [
              { label: "For Startups", href: "/solutions/startups", description: "First 50 eng hires with zero overhead" },
              { label: "For Enterprise", href: "/solutions/enterprise", description: "Audit + SSO for platform orgs" },
              { label: "Candidate Screening Guide", href: "/guides/candidate-screening-guide", description: "Run calibrated eng loops" },
            ]},
          ]} />
        </article>
        <RelatedCTA title="Ship your next eng req faster" description="Upload role + resumes. Get a rubric, blind scores and interview questions in one pass." href="/auth?tab=signup" label="Start Engineering Campaign" />
      </main>
      <Footer />
    </div>
  );
}
