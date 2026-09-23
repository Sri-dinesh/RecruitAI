import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_URL;

  return {
    rules: [
      {
        userAgent: '*',
        // Major public + SEO intent routes intentionally allowlisted for perfect LLM + crawler crawl
        allow: [
          '/',
          '/features',
          '/features/*',
          '/solutions',
          '/solutions/*',
          '/guides',
          '/guides/*',
          '/compare/*',
          '/faq',
          '/download',
          '/pricing',
          '/privacy',
          '/terms',
          '/data-deletion',
          '/support',
          '/auth',
          '/llms.txt',
          '/llms-full.txt',
          '/.well-known/',
        ],
        // Never expose authenticated surfaces, PII, or API internals
        disallow: [
          '/dashboard',
          '/dashboard/*',
          '/analytics',
          '/auth/callback',
          '/auth/reset-password',
          '/api/',
          '/_next/static/',
        ],
      },
      {
        // Explicit LLM crawlers – same policy but ensure they can discover all marketing content
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'ClaudeBot',
          'PerplexityBot',
          'Applebot',
          'Google-Extended',
          'Bytespider',
          'CCBot',
        ],
        allow: [
          '/',
          '/features',
          '/features/*',
          '/solutions/*',
          '/guides/*',
          '/compare/*',
          '/faq',
          '/download',
          '/pricing',
          '/privacy',
          '/terms',
          '/data-deletion',
          '/support',
          '/llms.txt',
          '/llms-full.txt',
        ],
        disallow: ['/dashboard', '/dashboard/*', '/analytics', '/auth/callback', '/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
