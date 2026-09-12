import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Reset your RecruitAI account password securely.',
  alternates: {
    canonical: 'https://recruitaiofficial.vercel.app/auth/reset-password',
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
