import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In or Create Account',
  description: 'Access the RecruitAI platform. Sign in to your recruiter account or start a new hiring campaign with multi-agent candidate screening.',
  alternates: {
    canonical: 'https://recruitaiofficial.vercel.app/auth',
  },
  openGraph: {
    title: 'Sign In or Create Account | RecruitAI',
    description: 'Sign in to access your recruitment pipelines, candidates, and AI co-pilot.',
    url: 'https://recruitaiofficial.vercel.app/auth',
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
