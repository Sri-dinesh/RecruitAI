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
  title: "Enterprise Recruitment Platform — Audit-Ready AI Hiring",
  description: "Enterprise recruitment platform with RLS tenant isolation, audit logging, blind hiring compliance and ATS sync for Greenhouse/Workday. Scale hiring across subsidiaries with governance intact.",
  path: "/solutions/enterprise",
  keywords: ["enterprise recruitment platform","enterprise hiring software","ATS enterprise integration","recruitment platform enterprise governance"],
});

const faq = [
  { question: "How does enterprise governance work?", answer: "Supabase Row-Level Security isolates tenants by user_id; every evaluation and status transition is timestamped. Bias-audit APIs report impact ratios for compliance, and dossiers include EEOC notices." },
  { question: "Do you offer SSO & permissions?", answer: "Enterprise plans add SSO/SAML, seat-based access, and audit streaming to your SIEM. Seats map to isolated campaign ownership, never cross-tenant visibility." },
  { question: "Can we sync with Workday?", answer: "Yes. Enterprise sync supports Workday JSON payloads with idempotent upserts and backlog reconciliation for stale requisitions." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions/enterprise" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: "RecruitAI — Enterprise", url: canonical("/solutions/enterprise"), applicationCategory: "BusinessApplication", publisher: { "@id": `${SITE_URL}/#organization` }, description: "Enterprise AI recruiting with governance and audit trails.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Solutions • Enterprise & Governance</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Scale hiring without abandoning compliance.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              For platform organizations, holding companies and scale-ups operating across subsidiaries: <strong className="text-foreground">RLS tenant isolation, SOC-2-ready patterns, human-in-the-loop gates and ATS sync</strong> keep velocity high and audits clean.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Start enterprise pilot</Link>
              <Link href="/features/ats-integration" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See ATS sync →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl">Enterprise checks, startup speed</h2>
            <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
              <div className="border border-border rounded-xl p-5 bg-[#F8F6F2]">
                <div className="font-semibold">Tenant isolation via RLS</div>
                <p className="text-muted leading-relaxed mt-2">auth.uid() = user_id on every table. Cross-tenant leakage is architecturally impossible, even across subsidiaries.</p>
              </div>
              <div className="border border-border rounded-xl p-5">
                <div className="font-semibold">Human-in-the-loop for legal</div>
                <p className="text-muted leading-relaxed mt-2">No email leaves nor calendar slot locks without explicit “Confirm.” AI proposes; humans decide — Article 22 alignment.</p>
              </div>
              <div className="border border-border rounded-xl p-5 bg-[#faf9f7]">
                <div className="font-semibold">Bias audits & retention TTL</div>
                <p className="text-muted leading-relaxed mt-2">Automated impact-ratio checks (NYC LL144 pattern) and retention policies that prune stale candidates after 180/365 days.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-2xl">FAQ — Enterprise</h2>
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
            { title: "Security & integration", links: [
              { label: "ATS Integration (Workday)", href: "/features/ats-integration", description: "Enterprise sync patterns" },
              { label: "Blind Hiring Vectors", href: "/features/blind-hiring", description: "Prove unbiased evaluation to legal" },
              { label: "Recruitment Automation", href: "/features/recruitment-automation", description: "LangGraph orchestration at scale" },
            ]},
            { title: "Trust", links: [
              { label: "Privacy Policy", href: "/privacy", description: "RLS, encryption, retention" },
              { label: "Terms & Conditions", href: "/terms", description: "Service agreements for procurement" },
              { label: "Support", href: "/support", description: "SLA: 2 business days" },
            ]},
          ]} />
        </article>
        <RelatedCTA title="Run a governance-safe pilot" description="Invite your legal and talent ops to review rubric, blind mode and audit logs before rollout." href="/auth?tab=signup" label="Start Enterprise Pilot" />
      </main>
      <Footer />
    </div>
  );
}
