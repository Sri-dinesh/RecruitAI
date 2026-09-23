import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { buildMetadata, canonical, breadcrumbJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "Pricing — Free 100 Evaluations, Pay as You Scale",
  description: "RecruitAI pricing: free tier for 100 candidate evaluations, no credit card. Paid plans scale by evaluations and seats — same blind hiring and ATS export on every tier.",
  path: "/pricing",
  keywords: ["recruitai pricing","AI recruiting pricing","resume screening pricing","ATS pricing"],
});

export default function Page() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: "RecruitAI — Pricing Plans",
        url: canonical("/pricing"),
        description: "AI recruiting software pricing with free tier and paid plans for evaluation scale.",
        brand: { "@type": "Organization", name: "RecruitAI" },
        offers: [
          { "@type": "Offer", price: "0", priceCurrency: "USD", name: "Free — 100 evaluations" },
          { "@type": "Offer", price: "49", priceCurrency: "USD", name: "Starter" },
          { "@type": "Offer", price: "199", priceCurrency: "USD", name: "Growth" },
        ],
      },
      { "@context": "https://schema.org", ...breadcrumbJsonLd([{ name: "Home", url: SITE_URL }, { name: "Pricing", url: canonical("/pricing") }]) },
    ],
  };

  const tiers = [
    {
      name: "Free",
      price: "$0",
      note: "No credit card",
      bullets: ["100 candidate evaluations", "Blind hiring toggle", "Greenhouse/Lever CSV export", "Community support (2 biz days SLA)", "Web + Android app included"],
      cta: "Start Free",
      href: "/auth?tab=signup",
      featured: false,
    },
    {
      name: "Starter",
      price: "$49",
      note: "/month • up to 500 evaluations",
      bullets: ["Everything in Free", "Higher throughput & parallel ingestion", "Priority pgvector cache", "ATS JSON export + interview kits", "Email support"],
      cta: "Choose Starter",
      href: "/auth?tab=signup",
      featured: true,
    },
    {
      name: "Growth",
      price: "$199",
      note: "/month • up to 2,500 evaluations",
      bullets: ["Everything in Starter", "Unlimited workspaces & campaigns", "Webhook ATS sync (Greenhouse/Workday)", "Bias audit + retention policy APIs", "Shared seats (hr + hiring managers)"],
      cta: "Choose Growth",
      href: "/auth?tab=signup",
      featured: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={ld} />
      <MarketingNav />
      <header className="border-b border-border bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-10">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Pricing", href: "/pricing" }]} />
          <div className="max-w-3xl mt-4">
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Pricing • Free to Scale</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Simple pricing — pay for evaluations, not buzzwords.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              Start with 100 free evaluations. Upgrade when you hire more — same blind hiring, same ATS export on every tier. No seat gatekeeping on core intelligence.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <section className="grid md:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div key={tier.name} className={`bg-white border rounded-2xl p-6 flex flex-col ${tier.featured ? "border-accent shadow-lg scale-[1.02]" : "border-border"}`}>
              {tier.featured && <span className="self-start bg-accent text-white text-[11px] font-bold tracking-widest uppercase rounded-full px-3 py-1">Most popular</span>}
              <h2 className="font-serif text-2xl mt-3">{tier.name}</h2>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold">{tier.price}</span>
                <span className="text-xs text-muted">{tier.note}</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm flex-1">
                {tier.bullets.map((b) => (
                  <li key={b} className="flex gap-2.5"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">{b}</span></li>
                ))}
              </ul>
              <Link href={tier.href} className={`mt-6 inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold transition-colors ${tier.featured ? "bg-accent text-white hover:bg-[#263a66]" : "bg-[#F8F6F2] border border-border hover:bg-white"}`}>
                {tier.cta}
              </Link>
            </div>
          ))}
        </section>

        <section className="bg-white border border-border rounded-2xl p-8">
          <h2 className="font-serif text-2xl">Enterprise?</h2>
          <p className="text-sm text-muted leading-relaxed mt-2 max-w-3xl">
            SSO/SAML, DPA, private VPC, audit streaming and custom retention TTL. Contact us — we’ll align pricing to subsidiary count and ATS surface, with legal review included.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="mailto:santhisridinesh@gmail.com?subject=Enterprise%20inquiry" className="bg-foreground text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#1a1f2e]">Contact Enterprise Sales</a>
            <Link href="/solutions/enterprise" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold">Enterprise solution →</Link>
          </div>
        </section>

        <section className="bg-[#F8F6F2] border border-border rounded-xl p-6 text-sm">
          <h3 className="font-semibold">Compare plans to use cases</h3>
          <div className="mt-3 grid md:grid-cols-3 gap-3">
            <Link href="/solutions/startups" className="bg-white border border-border rounded-lg p-4 hover:border-accent/30">Startups →<div className="text-xs text-muted mt-1">Free tier covers first few hires</div></Link>
            <Link href="/solutions/tech-hiring" className="bg-white border border-border rounded-lg p-4 hover:border-accent/30">Tech hiring →<div className="text-xs text-muted mt-1">Starter scales to ~25 eng roles/quarter</div></Link>
            <Link href="/solutions/enterprise" className="bg-white border border-border rounded-lg p-4 hover:border-accent/30">Enterprise →<div className="text-xs text-muted mt-1">Growth + SSO for multi-subsidiary rollouts</div></Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
