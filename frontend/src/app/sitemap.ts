import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site';

/**
 * Comprehensive sitemap covering all indexable public routes.
 * Priorities reflect keyword value + internal link depth.
 * Private routes (/dashboard, /analytics, /api, /auth/*) are excluded intentionally.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL;
  const now = new Date();

  // Helper to build entry
  const entry = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
    lastModified = now
  ): MetadataRoute.Sitemap[number] => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  });

  return [
    // ── Primary landing ───────────────────────────────────────────────
    entry('/', 1.0, 'daily'),
    entry('/features', 0.9, 'weekly'),
    entry('/pricing', 0.88, 'weekly'),
    entry('/download', 0.85, 'weekly'),
    entry('/faq', 0.85, 'weekly'),

    // ── High-value feature intent pages ──────────────────────────────
    entry('/features/ai-resume-screening', 0.9, 'weekly'),
    entry('/features/ai-candidate-screening', 0.9, 'weekly'),
    entry('/features/blind-hiring', 0.88, 'weekly'),
    entry('/features/ats-integration', 0.88, 'weekly'),
    entry('/features/recruitment-automation', 0.88, 'weekly'),

    // ── Industry / role landing pages ────────────────────────────────
    entry('/solutions/startups', 0.82, 'weekly'),
    entry('/solutions/enterprise', 0.82, 'weekly'),
    entry('/solutions/tech-hiring', 0.84, 'weekly'),
    entry('/solutions/hr-teams', 0.82, 'weekly'),

    // ── Content / Guides (evergreen search value) ────────────────────
    entry('/guides', 0.8, 'weekly'),
    entry('/guides/ai-recruiting-guide', 0.82, 'monthly'),
    entry('/guides/resume-screening-guide', 0.82, 'monthly'),
    entry('/guides/candidate-screening-guide', 0.8, 'monthly'),
    entry('/guides/ats-guide', 0.8, 'monthly'),

    // ── Comparison / alternative pages (high commercial intent) ───────
    entry('/compare/greenhouse-vs-recruitai', 0.78, 'monthly'),
    entry('/compare/lever-vs-recruitai', 0.78, 'monthly'),

    // ── Trust & compliance (required for Play Console + crawlable) ───
    entry('/privacy', 0.7, 'monthly'),
    entry('/terms', 0.7, 'monthly'),
    entry('/support', 0.75, 'weekly'),
    entry('/data-deletion', 0.6, 'monthly'),

    // ── Auth: indexable but lower priority (branded) ─────────────────
    entry('/auth', 0.5, 'monthly'),
  ];
}
