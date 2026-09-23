import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RecruitAI - AI Recruiting Software & Candidate Intelligence',
    short_name: 'RecruitAI',
    description:
      'AI resume screening, blind candidate evaluation, ATS export & hiring analytics — autonomous recruiting with human-in-the-loop control. Web & Android.',
    start_url: '/',
    display: 'standalone',
    scope: '/',
    background_color: '#F8F6F2',
    theme_color: '#1B2A4A',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity', 'utilities'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
    screenshots: [
      {
        src: '/og-image.png',
        sizes: '1200x630',
        type: 'image/png',
        form_factor: 'wide',
        label: 'RecruitAI — Precision Candidate Intelligence',
      },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard', description: 'Open recruiter workspace' },
      { name: 'Features', url: '/features', description: 'Explore AI recruiting features' },
      { name: 'Download Android App', url: '/download', description: 'Get RecruitAI on Google Play' },
    ],
    related_applications: [
      {
        platform: 'play',
        url: 'https://play.google.com/store/apps/details?id=com.recruitai.app',
        id: 'com.recruitai.app',
      },
    ],
    prefer_related_applications: false,
  };
}
