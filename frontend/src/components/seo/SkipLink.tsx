// Accessibility + SEO: skip to content links help crawlers and keyboard users
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-foreground focus:border focus:border-border focus:rounded-md focus:px-4 focus:py-2 focus:shadow-md"
    >
      Skip to main content
    </a>
  );
}
