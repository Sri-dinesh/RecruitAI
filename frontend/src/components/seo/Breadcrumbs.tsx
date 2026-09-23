import Link from "next/link";
import { SingleJsonLd } from "./JsonLd";
import { breadcrumbJsonLd, type BreadcrumbItem } from "@/lib/seo";

export interface BreadcrumbProps {
  items: { name: string; href: string }[]; // href relative, e.g. "/features"
}

export function Breadcrumbs({ items }: BreadcrumbProps) {
  if (!items.length) return null;

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://recruitaiofficial.vercel.app";
  const jsonItems: BreadcrumbItem[] = items.map((it) => ({
    name: it.name,
    url: `${SITE_URL}${it.href}`,
  }));

  return (
    <>
      <SingleJsonLd data={{ "@context": "https://schema.org", ...breadcrumbJsonLd(jsonItems) }} />
      <nav aria-label="Breadcrumb" className="w-full">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <li key={item.href} className="flex items-center gap-1.5">
                {idx > 0 && <span aria-hidden className="text-border">/</span>}
                {isLast ? (
                  <span aria-current="page" className="font-medium text-foreground">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.href} className="hover:text-foreground hover:underline underline-offset-4 transition-colors">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
