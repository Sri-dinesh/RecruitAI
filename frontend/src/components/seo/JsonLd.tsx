// Safe JSON-LD injection — validated against schema.org before rendering
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const payload = Array.isArray(data) ? data : [data];
  // Filter out empty/null to prevent Google warnings
  const cleaned = payload.filter(Boolean);
  if (cleaned.length === 0) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(cleaned.length === 1 ? cleaned[0] : { "@context": "https://schema.org", "@graph": cleaned }) }}
    />
  );
}

// Convenience: inject a single object without graph wrapping
export function SingleJsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
