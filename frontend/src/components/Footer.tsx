'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/brand/Logo';
import PlayStoreBadge, { GooglePlayIcon, PLAY_STORE_URL } from '@/components/brand/PlayStoreBadge';
import { useAuth } from '@/context/AuthContext';
import { SITE_URL } from '@/config/site';

export interface FooterProps {
  variant?: 'full' | 'simple';
  className?: string;
}

export default function Footer({ variant = 'full', className = '' }: FooterProps) {
  const { user, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuth = mounted && !authLoading && !!user;
  const currentYear = new Date().getFullYear();
  const displayHost = SITE_URL.replace(/^https?:\/\//, '');

  if (variant === 'simple') {
    return (
      <footer className={`border-t border-border bg-white ${className}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted text-center md:text-left">
            © {currentYear} RecruitAI •{' '}
            <a
              href={SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              {displayHost}
            </a>{' '}
            •{' '}
            <a
              href="mailto:santhisridinesh@gmail.com"
              className="underline hover:text-foreground transition-colors"
            >
              santhisridinesh@gmail.com
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium">
            <Link href="/privacy" className="text-muted hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="text-muted hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/data-deletion" className="text-muted hover:text-foreground transition-colors">
              Data Deletion
            </Link>
            <Link href="/support" className="text-muted hover:text-foreground transition-colors">
              Support
            </Link>
            <Link href="/" className="text-muted hover:text-foreground transition-colors">
              Home
            </Link>
          </div>
        </div>
      </footer>
    );
  }

  // Full 4-column rich footer
  return (
    <footer className={`border-t border-border bg-white ${className}`}>
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 text-left">
          {/* Brand & Mission Column */}
          <div>
            <Logo href="/" size="md" />
            <p className="text-sm text-muted mt-4 leading-relaxed">
              The autonomous precision intelligence layer for modern technical hiring. Multi-agent evaluation, blind screening, and human-in-the-loop workflows on Web and Android.
            </p>
            <p className="text-xs text-muted mt-4">© {currentYear} RecruitAI. All rights reserved.</p>
          </div>

          {/* Platform Links */}
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-4">Platform</h4>
            <ul className="space-y-2.5 text-sm text-muted">
              <li>
                <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/#features" className="hover:text-foreground transition-colors">
                  Feature Deep Dive
                </Link>
              </li>
              <li>
                <Link href="/#mobile" className="hover:text-foreground transition-colors">
                  Android Mobile App
                </Link>
              </li>
              <li>
                <Link href="/#integrations" className="hover:text-foreground transition-colors">
                  ATS Integrations
                </Link>
              </li>
              <li>
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors flex items-center gap-1.5 text-accent font-semibold"
                >
                  <GooglePlayIcon className="w-3.5 h-3.5" />
                  <span>Download on Google Play</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Trust & Compliance Links */}
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-4">Trust & Compliance</h4>
            <ul className="space-y-2.5 text-sm text-muted">
              <li>
                <Link href="/#security" className="hover:text-foreground transition-colors">
                  Security & Privacy
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/data-deletion" className="hover:text-foreground transition-colors">
                  Data Deletion Portal
                </Link>
              </li>
              <li>
                <Link href="/support" className="hover:text-foreground transition-colors">
                  Help Center & Support
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact & Access */}
          <div>
            <h4 className="font-semibold text-foreground text-sm mb-4">Contact & Access</h4>
            <ul className="space-y-2 text-sm text-muted">
              <li>
                <a
                  href="mailto:santhisridinesh@gmail.com"
                  className="hover:text-foreground transition-colors"
                >
                  santhisridinesh@gmail.com
                </a>
              </li>
              <li>
                <a
                  href={SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  {displayHost}
                </a>
              </li>
              <li>
                <span className="text-xs text-muted/80">Support SLA: within 2 business days</span>
              </li>
            </ul>
            <div className="mt-6 flex items-center gap-3">
              {isAuth ? (
                <Link
                  href="/dashboard"
                  className="text-sm font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  Open Dashboard →
                </Link>
              ) : (
                <>
                  <Link href="/auth?tab=login" className="text-sm font-semibold text-accent hover:underline">
                    Login →
                  </Link>
                  <span className="text-border">|</span>
                  <Link href="/auth?tab=signup" className="text-sm font-semibold text-accent hover:underline">
                    Signup →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted text-center md:text-left leading-relaxed max-w-2xl">
            RecruitAI is an enterprise hiring intelligence platform. Outputs assist human recruiters and hiring managers in conducting structured, unbiased evaluations.
          </p>
          <div className="flex flex-wrap gap-6 text-xs font-medium text-muted">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/data-deletion" className="hover:text-foreground">
              Data Deletion
            </Link>
            <Link href="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground flex items-center gap-1 font-semibold text-accent"
            >
              <span>Google Play App</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
