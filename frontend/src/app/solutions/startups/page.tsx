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
  title: "Recruitment Software for Startups — Hire the First 50 with AI",
  description: "Recruitment software for startups: screen resumes with AI, run blind hiring, and export to ATS without hiring a recruiter. Free 100 evaluations, mobile approvals, and zero glue code.",
  path: "/solutions/startups",
  keywords: ["recruitment software for startups","startup hiring platform","AI recruiting for startups","small business hiring software"],
});

const faq = [
  { question: "Do startups need an ATS first?", answer: "No. Start with RecruitAI as your screening & scoring layer; export CSVs to Sheets or push to Greenhouse/Lever when you adopt an ATS." },
  { question: "How cheap is it to start?", answer: "Free tier includes 100 evaluations. No credit card, no demo required. Upgrade only when you fill more roles." },
  { question: "Can founders approve on phone?", answer: "Yes. Android app lets founders approve outreach, scan scorecards and receive match alerts away from desktop." },
];

export default function Page() {
  const crumbs = [{ name: "Home", href: "/" }, { name: "Solutions", href: "/solutions/startups" }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "SoftwareApplication", name: "RecruitAI — For Startups", url: canonical("/solutions/startups"), applicationCategory: "BusinessApplication", publisher: { "@id": `${SITE_URL}/#organization` }, description: "AI recruiting for startups.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
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
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Solutions • Startups & Small Teams</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Hire your first 50 without a recruiting agency.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              RecruitAI gives founders and early hiring managers a <strong className="text-foreground">full recruiting stack in one tab</strong> — parsing, scoring, blind review and outreach drafting — so you don’t need to hire recruiters to hire engineers.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth?tab=signup" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66]">Start hiring free</Link>
              <Link href="/pricing" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">See pricing →</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <article className="bg-white border border-border rounded-2xl p-8 md:p-10 space-y-10">
          <section>
            <h2 className="font-serif text-2xl">Why starters choose RecruitAI before Greenhouse</h2>
            <ul className="mt-4 grid md:grid-cols-2 gap-3 text-sm">
              {[
                "2-minute setup: paste JD → drop PDFs → scores ready",
                "AI does senior recruiter work at 1/20th the cost",
                "Blind mode protects you from early-stage bias lawsuits",
                "Exports when you’re ready — not on day one",
              ].map((t) => (
                <li key={t} className="flex gap-2.5 bg-[#F8F6F2] border border-border rounded-lg px-4 py-3"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">{t}</span></li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl">Typical startup workflow</h2>
            <div className="mt-4 grid md:grid-cols-4 gap-4 text-sm">
              {["Founders post JD", "Share link → 200 applicants in 48h", "AI ranks in minutes", "Interview top 10, not top-of-stack lottery"].map((s, i) => (
                <div key={s} className="border border-border rounded-xl p-4 text-center bg-[#F8F6F2]">
                  <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold mx-auto">{i + 1}</div>
                  <div className="font-semibold mt-2">{s}</div>
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
            { title: "Feature spine", links: [
              { label: "AI Resume Screening", href: "/features/ai-resume-screening", description: "Screen at founder speed" },
              { label: "Tech Hiring Solution", href: "/solutions/tech-hiring", description: "Engineering-specific rubric" },
              { label: "HR Teams Solution", href: "/solutions/hr-teams", description: "When you hire a recruiter, they’ll love it" },
            ]},
            { title: "Guides", links: [
              { label: "AI Recruiting Guide", href: "/guides/ai-recruiting-guide", description: "When to automate in a tiny team" },
              { label: "Download Android App", href: "/download", description: "Approve candidates from your commute" },
              { label: "FAQ", href: "/faq", description: "All questions answered" },
            ]},
          ]} />
        </article>
        <RelatedCTA title="Make your next hire without a headhunter" description="Founders close 3x more pipelines when screening is instant and unbiased." href="/auth?tab=signup" label="Start Startup Campaign" />
      </main>
      <Footer />
    </div>
  );
}
