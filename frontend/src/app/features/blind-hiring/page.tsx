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
  title: "Blind Hiring Platform — Unbiased AI Candidate Screening",
  description: "Blind hiring software that redacts names, contacts, locations and graduation years before AI scoring. Prove skill-only evaluation with audit-logged bias checks and human-in-the-loop reveal.",
  path: "/features/blind-hiring",
  keywords: ["blind hiring","unbiased hiring","blind recruitment","bias-free hiring","demographic redaction","blind screening"],
});

const faq = [
  { question: "What exactly does blind mode redact?", answer: "Names, email addresses, phone numbers, photos, locations, graduation years, university prestige markers and gendered pronouns. Only technical accomplishments, stack depth and project impact remain for scoring." },
  { question: "Can recruiters reveal identity after scoring?", answer: "Yes. Identity is hidden during evaluation and revealed only when you move a candidate to interview. This preserves auditability while restoring context for final conversations." },
  { question: "Does blind hiring affect accuracy?", answer: "It increases accuracy for role-relevant skills. Models evaluate architecture, code impact and tooling depth — not demographic proxies that should never influence engineering hiring." },
  { question: "Is blind screening compliant with NYC LL144?", answer: "RecruitAI logs selection and scoring distributions and can generate impact-ratio reports. Combine with human confirmation checkpoints for Article 22 and EEOC-aligned workflows." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Features", href: "/features" }, { name: "Blind Hiring", href: "/features/blind-hiring" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: "RecruitAI — Blind Hiring", url: canonical("/features/blind-hiring"), applicationCategory: "BusinessApplication", publisher: { "@id": `${SITE_URL}/#organization` }, description: "Blind hiring platform with PII redaction, rubric scoring and human-in-the-loop reveal.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold tracking-widest uppercase text-emerald-700">Ethical AI • 100% Blind Mode Compliance</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Blind hiring that actually hides demographics — before scoring, not after.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              RecruitAI enforces <strong className="text-foreground">demographic redaction before LLM reasoning</strong>. Names, emails, photos, locations and graduation markers are stripped automatically so scores reflect only verified engineering substance — not subconscious bias.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Enable blind mode free</Link>
              <Link href="/features/ai-candidate-screening" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">How scoring works →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl">Why blind hiring matters</h2>
            <p className="text-sm text-muted leading-relaxed mt-3">
              Traditional resume review exposes recruiters to names, photos and prestige signals before any skill evaluation. Those cues disproportionately harm candidates from non-traditional backgrounds. RecruitAI’s approach is architectural: blind mode runs as a <strong className="text-foreground">pre-processing guardrail</strong> inside the ingestion pipeline. Redacted content is what the evaluator agent sees; the original is retained (RLS-isolated) only for post-screen reveal and compliance audit.
            </p>
            <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
              <div className="border border-emerald-200 bg-emerald-50/60 rounded-xl p-5">
                <div className="text-sm font-semibold text-emerald-900">Redacted fields</div>
                <ul className="mt-2 list-disc pl-5 text-emerald-800 space-y-1 leading-relaxed">
                  <li>Full name, photo, contact identifiers</li>
                  <li>Location, graduation year, institution prestige</li>
                  <li>Gendered pronouns and other demographic proxies</li>
                </ul>
              </div>
              <div className="border border-border rounded-xl p-5">
                <div className="font-semibold">Scored fields</div>
                <ul className="mt-2 list-disc pl-5 text-muted space-y-1 leading-relaxed">
                  <li>Architecture patterns & system design depth</li>
                  <li>Language/tooling proficiency with evidence</li>
                  <li>Measured impact: scale, latency, revenue, users</li>
                </ul>
              </div>
              <div className="border border-border rounded-xl p-5 bg-[#F8F6F2]">
                <div className="font-semibold">Auditability</div>
                <p className="text-sm text-muted leading-relaxed mt-2">Every redaction and score is logged with timestamps. Export hiring dossiers with bias-audit disclosures and EEOC non-discrimination notices.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">Toggle per requisition — reveal when ready</h2>
            <p className="text-sm text-muted leading-relaxed mt-3">
              Blind mode is not global: set it per campaign. Enable for top-of-funnel screening to maximize fairness, then reveal candidate identities when you shortlist for interview. Recruiters remain in control, and the system never re-exposes PII to the evaluation agent after reveal.
            </p>
            <div className="mt-4 flex items-center gap-3 bg-[#F8F6F2] border border-border rounded-xl p-5 text-sm">
              <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">✓</span>
              <span className="text-muted"><strong className="text-foreground">Human-in-the-loop guarantee:</strong> No email or calendar hold executes without explicit “Confirm” — even when blind mode is active.</span>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">FAQ — Blind hiring</h2>
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
            { title: "Pair blind hiring with", links: [
              { label: "AI Candidate Screening", href: "/features/ai-candidate-screening", description: "Rubric scoring that blind mode protects" },
              { label: "Resume Screening Automation", href: "/features/ai-resume-screening", description: "Parsing that powers unbiased pipelines" },
              { label: "Recruitment Automation", href: "/features/recruitment-automation", description: "LangGraph agents that respect HITL gates" },
            ]},
            { title: "Proof points", links: [
              { label: "Security & Privacy", href: "/#security" as any, description: "RLS isolation and encryption" },
              { label: "Candidate Screening Guide", href: "/guides/candidate-screening-guide", description: "Run calibrated, defensible reviews" },
              { label: "For Enterprise", href: "/solutions/enterprise", description: "Need audit trails for legal teams? Start here." },
            ]},
          ]} />
        </article>
        <RelatedCTA title="Run your first blind screening today" description="Create a campaign with blind mode enabled — see how scores shift when only skill matters." href="/auth?tab=signup" label="Start Blind Screening Free" />
      </main>
      <Footer />
    </div>
  );
}
