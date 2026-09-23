'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import Logo from '@/components/brand/Logo';
import { useAuth } from '@/context/AuthContext';
import PlayStoreBadge from '@/components/brand/PlayStoreBadge';

export default function MarketingNav() {
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMounted(true), []);
  const isAuth = mounted && !loading && !!user;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-[#F8F6F2]/85 border-b border-border/60">
      <div className="flex items-center justify-between px-6 md:px-8 py-4 max-w-7xl mx-auto">
        <Logo href="/" size="md" priority />
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
          <Link href="/features" className="text-muted hover:text-foreground transition-colors">Features</Link>
          <Link href="/solutions/tech-hiring" className="text-muted hover:text-foreground transition-colors">Solutions</Link>
          <Link href="/guides" className="text-muted hover:text-foreground transition-colors">Guides</Link>
          <Link href="/compare/greenhouse-vs-recruitai" className="text-muted hover:text-foreground transition-colors">Compare</Link>
          <Link href="/pricing" className="text-muted hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/faq" className="text-muted hover:text-foreground transition-colors">FAQ</Link>
          <Link href="/support" className="text-muted hover:text-foreground transition-colors">Support</Link>
        </nav>
        <div className="flex items-center gap-3">
          <PlayStoreBadge variant="pill" className="hidden sm:inline-flex" />
          {isAuth ? (
            <Link href="/dashboard" className="hidden sm:inline-flex text-sm font-medium text-white bg-accent px-5 py-2.5 rounded-md hover:bg-[#263a66] transition-colors">
              Dashboard →
            </Link>
          ) : (
            <>
              <Link href="/auth?tab=login" className="hidden sm:inline-flex text-sm font-medium text-foreground hover:underline underline-offset-4">
                Login
              </Link>
              <Link href="/auth?tab=signup" className="hidden sm:inline-flex text-sm font-medium text-white bg-accent px-5 py-2.5 rounded-md hover:bg-[#263a66] transition-colors">
                Start Free
              </Link>
            </>
          )}
          <button
            aria-label="Open menu"
            className="lg:hidden inline-flex w-9 h-9 items-center justify-center rounded-md border border-border bg-white"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className="text-lg leading-none">{mobileOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-white px-6 py-4 space-y-3">
          {[
            ['Features', '/features'],
            ['Solutions', '/solutions/tech-hiring'],
            ['Guides', '/guides'],
            ['Compare', '/compare/greenhouse-vs-recruitai'],
            ['Pricing', '/pricing'],
            ['FAQ', '/faq'],
            ['Support', '/support'],
            ['Download App', '/download'],
          ].map(([label, href]) => (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-foreground py-1">
              {label}
            </Link>
          ))}
          {!isAuth && (
            <div className="flex gap-3 pt-2">
              <Link href="/auth?tab=login" className="flex-1 text-center border border-border rounded-md py-2 text-sm font-medium">Login</Link>
              <Link href="/auth?tab=signup" className="flex-1 text-center bg-accent text-white rounded-md py-2 text-sm font-semibold">Start Free</Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
