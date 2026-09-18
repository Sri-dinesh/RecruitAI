import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_URL;

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/auth',
          '/privacy',
          '/terms',
          '/data-deletion',
          '/support',
          '/llms.txt',
          '/llms-full.txt',
          '/.well-known/',
        ],
        disallow: [
          '/dashboard',
          '/analytics',
          '/auth/callback',
          '/api/',
          '/_next/',
        ],
      },
      {
        userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Applebot', 'Googlebot', 'Bingbot'],
        allow: [
          '/',
          '/auth',
          '/privacy',
          '/terms',
          '/data-deletion',
          '/support',
          '/llms.txt',
          '/llms-full.txt',
        ],
        disallow: [
          '/dashboard',
          '/analytics',
          '/auth/callback',
          '/api/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
