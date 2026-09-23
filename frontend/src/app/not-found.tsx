import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/config/site";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The page you requested could not be found. Explore RecruitAI's AI recruiting software, candidate screening, and ATS integrations.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F8F6F2] flex flex-col">
      <header className="border-b border-border bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-4">
          <Link href="/" className="font-serif font-semibold text-foreground text-lg">
            RecruitAI<span className="text-accent">.</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-24 text-center">
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold tracking-widest uppercase text-amber-700">
          404 — Page Not Found
        </span>
        <h1 className="font-serif text-4xl md:text-5xl text-foreground mt-6">We couldn’t find that page.</h1>
        <p className="text-muted max-w-xl mt-4 leading-relaxed">
          The link you followed may be broken, or the page may have been moved. Try one of the popular destinations below — or head back to the homepage.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link href="/" className="bg-accent text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#263a66] transition-colors">
            Go to homepage
          </Link>
          <Link href="/features" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold hover:bg-[#faf9f7] transition-colors">
            Explore features
          </Link>
          <Link href="/support" className="bg-white border border-border px-6 py-3 rounded-lg font-semibold hover:bg-[#faf9f7] transition-colors">
            Contact support
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl w-full text-left">
          {[
            { label: "AI Resume Screening", href: "/features/ai-resume-screening", desc: "Automate top-of-funnel resume review" },
            { label: "Blind Hiring", href: "/features/blind-hiring", desc: "Unbiased candidate evaluation" },
            { label: "ATS Integration", href: "/features/ats-integration", desc: "Greenhouse • Lever • Workday export" },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="bg-white border border-border rounded-xl p-5 hover:border-accent/30 hover:shadow-sm transition-all">
              <div className="text-sm font-semibold text-foreground">{c.label}</div>
              <div className="text-xs text-muted mt-1">{c.desc}</div>
            </Link>
          ))}
        </div>

        <p className="text-xs text-muted mt-10">
          If you believe this is an error, email{" "}
          <a href="mailto:santhisridinesh@gmail.com" className="underline text-accent">
            santhisridinesh@gmail.com
          </a>{" "}
          or visit <Link href="/support" className="underline text-accent">Support</Link>. Site: {SITE_URL}
        </p>
      </main>
    </div>
  );
}
