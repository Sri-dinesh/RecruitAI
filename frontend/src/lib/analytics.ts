/**
 * Analytics readiness — GA4 + Google Search Console + Bing verification
 * Placeholders: wire NEXT_PUBLIC_GA_ID and NEXT_PUBLIC_GTM_ID in Vercel env.
 * No tracking fires until IDs are present; zero performance cost otherwise.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://recruitaiofficial.vercel.app";

export function isAnalyticsEnabled(): boolean {
  return Boolean(GA_ID || GTM_ID);
}

// Events for future use — typed for OTA measurement
export type AnalyticsEvent =
  | { name: "sign_up"; params?: { method?: string } }
  | { name: "view_feature"; params: { feature: string } }
  | { name: "download_app"; params: { platform: "android" | "ios" } }
  | { name: "export_ats"; params: { provider: string } }
  | { name: "faq_expand"; params: { question: string } };

export function trackEvent(event: AnalyticsEvent) {
  if (!isAnalyticsEnabled() || typeof window === "undefined") return;
  // gtag stub — real implementation injected via <AnalyticsScripts />
  // @ts-ignore
  window.gtag?.("event", event.name, event.params);
}
