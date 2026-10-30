import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import { buildMetadata, canonical, breadcrumbJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";
import PricingCards from "@/components/pricing/PricingCards";

export const metadata: Metadata = buildMetadata({
  title: "Pricing — Transparent Candidate Quotas & Upgrades",
  description: "RecruitAI pricing: free starter credits to test AI candidate screening, followed by affordable Starter, Pro, and Agency tiers powered by Razorpay checkout.",
  path: "/pricing",
  keywords: ["recruitai pricing", "AI recruiting pricing", "resume screening pricing", "ATS pricing", "razorpay SaaS"],
});

export default function Page() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: "RecruitAI — Pricing Plans",
        url: canonical("/pricing"),
        description: "AI recruiting software pricing with starter, pro, and agency plans for candidate evaluation scale.",
        brand: { "@type": "Organization", name: "RecruitAI" },
        offers: [
          { "@type": "Offer", price: "0", priceCurrency: "INR", name: "Free Tier — 10 evaluations" },
          { "@type": "Offer", price: "1499", priceCurrency: "INR", name: "Starter Recruiter" },
          { "@type": "Offer", price: "3999", priceCurrency: "INR", name: "Pro Recruiter" },
          { "@type": "Offer", price: "7999", priceCurrency: "INR", name: "Agency / Growth" },
        ],
      },
      { "@context": "https://schema.org", ...breadcrumbJsonLd([{ name: "Home", url: SITE_URL }, { name: "Pricing", url: canonical("/pricing") }]) },
    ],
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={ld} />
      <MarketingNav />
      <header className="border-b border-border bg-white">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-10">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Pricing", href: "/pricing" }]} />
          <div className="max-w-3xl mt-4">
            <span className="inline-flex px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Pricing • Pay as You Scale</span>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">Simple pricing — pay for candidate intelligence, not seat counts.</h1>
            <p className="text-muted text-lg leading-relaxed mt-4">
              Get started with free evaluations on us. Scale into Starter (₹1,499), Pro (₹3,999), or Agency (₹7,999) with seamless Razorpay checkout.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-10 space-y-10">
        <section>
          <PricingCards />
        </section>

        <section className="bg-white border border-border rounded-2xl p-8">
          <h2 className="font-serif text-2xl">Enterprise Custom Workspaces?</h2>
          <p className="text-sm text-muted leading-relaxed mt-2 max-w-3xl">
            SSO/SAML, DPA, private VPC, audit streaming, custom retention TTL, and dedicated account managers. Reach out directly to configure custom annual volume contracts.
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
