import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { buildMetadata, canonical, breadcrumbJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "Recruitment Guides — AI Hiring, Resume Screening & ATS Playbooks",
  description: "Practical recruitment guides: AI recruiting, resume screening, candidate screening and ATS integration — with blind hiring checklists, rubric templates and ATS export playbooks.",
  path: "/guides",
  keywords: ["recruitment guides","AI recruiting guide","resume screening guide","candidate screening guide","ATS guide","hiring playbook"],
});

const guides = [
  { href: "/guides/ai-recruiting-guide", title: "AI Recruiting Guide", desc: "When to automate, when to keep human judgment, and how to sell automation to legal.", meta: "12 min • Strategy" },
  { href: "/guides/resume-screening-guide", title: "Resume Screening Guide", desc: "Playbook for consistent, defensible screening — from parsing to score calibration.", meta: "14 min • Playbook" },
  { href: "/guides/candidate-screening-guide", title: "Candidate Screening Guide", desc: "Rubric design, blind workflows and interview-kit hand-offs for hiring managers.", meta: "15 min • Handbook" },
  { href: "/guides/ats-guide", title: "ATS Guide: Greenhouse, Lever, Workday", desc: "Integration patterns, payload schemas, webhook and spreadsheet handoff.", meta: "11 min • Integration" },
];

export default function Page() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "RecruitAI Guides",
        url: canonical("/guides"),
        description: "Recruitment guides for AI hiring, screening and ATS integration.",
        publisher: { "@id": `${SITE_URL}/#organization` },
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      { "@context": "https://schema.org", ...breadcrumbJsonLd([{ name: "Home", url: SITE_URL }, { name: "Guides", url: canonical("/guides") }]) },
    ],
  };
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={ld} />
      <MarketingNav />
      <header className="border-b border-border bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-10">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }]} />
          <div className="max-w-3xl mt-4">
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Knowledge Hub • Evergreen SEO Content</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Guides that recruiters and hiring managers actually use.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              No fluff, no AI-spam. Each guide provides checklists, rubric templates and export patterns you can run tomorrow — with links to the product workflows they reference.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10">
        <div className="grid md:grid-cols-2 gap-6">
          {guides.map((g) => (
            <Link key={g.href} href={g.href} className="group bg-white border border-border rounded-2xl p-6 hover:border-accent/30 hover:shadow-sm transition-all">
              <div className="text-xs font-semibold tracking-widest uppercase text-muted">{g.meta}</div>
              <h2 className="font-serif text-xl mt-2 group-hover:text-accent">{g.title}</h2>
              <p className="text-sm text-muted leading-relaxed mt-2">{g.desc}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent mt-4">Read guide →</span>
            </Link>
          ))}
        </div>

        <div className="mt-10 bg-white border border-border rounded-2xl p-6">
          <h3 className="font-semibold">Browse by intent</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/features/ai-resume-screening" className="bg-[#F8F6F2] border border-border rounded-full px-3 py-1.5 hover:border-accent">AI resume screening</Link>
            <Link href="/features/blind-hiring" className="bg-[#F8F6F2] border border-border rounded-full px-3 py-1.5 hover:border-accent">Blind hiring</Link>
            <Link href="/features/ats-integration" className="bg-[#F8F6F2] border border-border rounded-full px-3 py-1.5 hover:border-accent">ATS integration</Link>
            <Link href="/solutions/tech-hiring" className="bg-[#F8F6F2] border border-border rounded-full px-3 py-1.5 hover:border-accent">Tech hiring</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
