import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/landing/MarketingNav";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { SingleJsonLd } from "@/components/seo/JsonLd";
import PlayStoreBadge, { PLAY_STORE_URL } from "@/components/brand/PlayStoreBadge";
import { buildMetadata, canonical, breadcrumbJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = buildMetadata({
  title: "Download RecruitAI Android App — Google Play",
  description: "Download RecruitAI on Google Play. Review candidate scorecards, approve AI outreach, manage blind screening and receive match alerts — synced with web dashboard via offline-resilient Expo app.",
  path: "/download",
  keywords: ["recruitai android app","download recruitai","google play recruiter app","AI recruiter android","candidate screening app"],
});

export default function Page() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MobileApplication",
        name: "RecruitAI",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Android",
        url: PLAY_STORE_URL,
        installUrl: PLAY_STORE_URL,
        downloadUrl: PLAY_STORE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", ratingCount: "127" },
      },
      { "@context": "https://schema.org", ...breadcrumbJsonLd([{ name: "Home", url: SITE_URL }, { name: "Download", url: canonical("/download") }]) },
    ],
  };
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-foreground">
      <SingleJsonLd data={ld} />
      <MarketingNav />
      <header className="border-b border-border bg-white">
        <div className="max-w-5xl mx-auto px-6 md:px-8 py-12 text-center">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Download", href: "/download" }]} />
          <span className="inline-flex mt-4 px-3 py-1 rounded-full bg-accent/10 border border-accent/15 text-[11px] font-semibold tracking-widest uppercase text-accent">Android • Google Play • Expo 57</span>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-4">RecruitAI for Android — your pipeline in your pocket.</h1>
          <p className="text-muted text-lg leading-relaxed mt-4 max-w-2xl mx-auto">
            Official Google Play app with 100% web parity: scorecards, blind toggle, approvals, ATS export and hiring analytics — plus offline queuing and SecureStore caching.
          </p>
          <div className="mt-8 flex justify-center">
            <PlayStoreBadge variant="badge" />
          </div>
          <p className="text-xs text-muted mt-3">Free for all accounts • No separate subscription • Syncs with web dashboard automatically</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 md:px-8 py-10 space-y-8">
        <section className="grid md:grid-cols-3 gap-4">
          {[
            { t: "Scorecards on the go", d: "Review rubric matrices and gaps while commuting; approve shortlist without laptop." },
            { t: "HITL approvals", d: "Confirm outreach drafts and interview slots with explicit tap — never auto-sent." },
            { t: "Offline-resilient", d: "Decisions queue in SecureStore; drained loss-free when connectivity returns." },
          ].map((c) => (
            <div key={c.t} className="bg-white border border-border rounded-xl p-5">
              <div className="font-semibold">{c.t}</div>
              <p className="text-sm text-muted leading-relaxed mt-2">{c.d}</p>
            </div>
          ))}
        </section>

        <section className="bg-white border border-border rounded-2xl p-8">
          <h2 className="font-serif text-2xl text-center">What’s inside the mobile experience</h2>
          <div className="mt-6 grid md:grid-cols-2 gap-4 text-sm">
            <ul className="space-y-2">
              <li className="flex gap-2.5"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">Copilot tab: multi-agent chat with streaming, voice-ready intents</span></li>
              <li className="flex gap-2.5"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">Candidates tab: decision cards, filters, blind reveal</span></li>
              <li className="flex gap-2.5"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">Workspace: 5-segment requisition / compare / schedule / email / intel</span></li>
            </ul>
            <ul className="space-y-2">
              <li className="flex gap-2.5"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">Analytics tab: KPIs, funnels, velocity & skill demand (Gifted Charts)</span></li>
              <li className="flex gap-2.5"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">Profile modal: GDPR export/purge, blind toggle, diagnostics ping</span></li>
              <li className="flex gap-2.5"><span className="text-emerald-600 font-bold">✓</span><span className="text-muted">Share sheet PDF dossier & ATS export (JSON/CSV)</span></li>
            </ul>
          </div>
          <div className="mt-6 flex justify-center">
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="bg-foreground text-white px-8 py-3.5 rounded-lg font-bold hover:bg-[#1a1f2e] transition-colors">Get on Google Play →</a>
          </div>
        </section>

        <section className="bg-[#F8F6F2] border border-border rounded-xl p-6 text-sm">
          <h3 className="font-semibold">Deep links & App Links</h3>
          <p className="text-muted leading-relaxed mt-2">
            Website URLs such as <code className="bg-white border border-border px-1.5 py-0.5 rounded text-xs">{SITE_URL}/features</code> open directly in the Android app via verified App Links (assetlinks.json → com.recruitai.app). Searching Google for RecruitAI features surfaces both web page and Play listing.
          </p>
          <div className="mt-3 flex gap-2 text-xs font-mono">
            <a href={`${SITE_URL}/.well-known/assetlinks.json`} target="_blank" className="underline text-accent">Verify assetlinks.json</a>
            <span className="text-border">•</span>
            <Link href="/support" className="underline text-accent">Support</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
