import type { Metadata } from 'next';
import { SITE_URL } from '@/config/site';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Reset your RecruitAI account password securely.',
  alternates: {
    canonical: `${SITE_URL}/auth/reset-password`,
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
