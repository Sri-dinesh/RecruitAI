import Link from "next/link";

export interface InternalLinkGroup {
  title: string;
  links: { label: string; href: string; description?: string }[];
}

export function InternalLinks({ groups }: { groups: InternalLinkGroup[] }) {
  return (
    <nav aria-label="Related pages" className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {groups.map((group) => (
        <div key={group.title}>
          <h3 className="text-xs font-bold tracking-widest uppercase text-muted mb-3">{group.title}</h3>
          <ul className="space-y-2.5">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="group flex flex-col gap-0.5 hover:opacity-90">
                  <span className="text-sm font-medium text-accent group-hover:underline underline-offset-4">
                    {link.label} →
                  </span>
                  {link.description && <span className="text-xs text-muted leading-relaxed">{link.description}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function RelatedCTA({ title, description, href, label }: { title: string; description: string; href: string; label: string }) {
  return (
    <div className="bg-foreground rounded-2xl px-8 py-10 text-center text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-accent/10 to-transparent pointer-events-none" />
      <h3 className="font-serif text-2xl md:text-3xl relative">{title}</h3>
      <p className="text-white/70 max-w-2xl mx-auto mt-3 text-sm leading-relaxed relative">{description}</p>
      <Link href={href} className="relative mt-6 inline-flex items-center justify-center bg-white text-foreground px-8 py-3.5 rounded-lg font-bold hover:bg-[#f3f4f6] transition-colors">
        {label}
      </Link>
    </div>
  );
}
