/**
 * Port of the embedding subset of `backend/app/services/redaction.py`
 * (AI-SEC-2).
 *
 * Only the stateless embedding path is needed by resume ingestion: emails,
 * phone numbers, URLs and addresses are replaced with opaque placeholders so
 * vectors cannot be inverted back to candidate PII. The reversible sanitizer
 * used by LLM prompts belongs with the agent layer.
 */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/g;
const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/gi;
const ADDRESS_REGEX =
  /\b(?:\d{1,5}\s+[\w\s]{1,25}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct)\b|\b\d{5}(?:-\d{4})?\b)/gi;

const NAME_STOPWORDS = new Set(['the', 'and', 'van', 'von', 'del']);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Stateless PII redaction designed for pgvector embeddings, matching
 * `redact_pii_for_embedding(text, candidate_name)`.
 */
export function redactPiiForEmbedding(text: string, candidateName?: string | null): string {
  if (!text) {
    return '';
  }

  let sanitized = text;

  // 1. Neutralize XML tag injection attempts.
  sanitized = sanitized.replaceAll('<candidate_resume', '&lt;candidate_resume');
  sanitized = sanitized.replaceAll('</candidate_resume', '&lt;/candidate_resume');

  // 2. Emails first, so partial name fragments cannot break an address.
  sanitized = sanitized.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');

  // 3. Phone numbers, skipping years and short digit groups.
  sanitized = sanitized.replace(PHONE_REGEX, (value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 4 && (digits.startsWith('19') || digits.startsWith('20'))) {
      return value;
    }
    if (digits.length < 7) {
      return value;
    }
    return '[REDACTED_PHONE]';
  });

  // 4. URLs.
  sanitized = sanitized.replace(URL_REGEX, '[REDACTED_URL]');

  // 5. Physical addresses.
  sanitized = sanitized.replace(ADDRESS_REGEX, '[REDACTED_LOCATION]');

  // 6. Candidate name, then individual name parts.
  if (candidateName && candidateName.trim()) {
    const cleanName = candidateName.trim();
    const opaqueName = '[CANDIDATE_ANONYMOUS]';
    sanitized = sanitized.replace(new RegExp(escapeRegExp(cleanName), 'gi'), opaqueName);
    for (const part of cleanName.split(/\s+/)) {
      if (part.length > 2 && !NAME_STOPWORDS.has(part.toLowerCase())) {
        sanitized = sanitized.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'), opaqueName);
      }
    }
  }

  return sanitized;
}
