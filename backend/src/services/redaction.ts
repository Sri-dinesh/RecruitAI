/**
 * Port of `backend/app/services/redaction.py` (AI-SEC-2, AI-SEC-4).
 *
 * Two responsibilities share one module because they form the prompt choke
 * point:
 *
 * - `PiiSanitizer` is stateful per LLM turn. It swaps emails, phones, URLs,
 *   addresses and candidate names for opaque tokens and keeps a bi-directional
 *   map so recruiter-facing text can be restored without ever exposing PII to
 *   the model.
 * - `detectPromptInjection` flags adversarial instructions embedded in resume
 *   text so the screening report can surface a security alert.
 *
 * `redactPiiForEmbedding` is the stateless embedding variant (no reversible
 * map) and is re-exported by `src/rag/redaction.ts` for ingestion.
 */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/g;
const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/gi;
const ADDRESS_REGEX =
  /\b(?:\d{1,5}\s+[\w\s]{1,25}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct)\b|\b\d{5}(?:-\d{4})?\b)/gi;

const NAME_STOPWORDS = new Set(['the', 'and', 'van', 'von', 'del']);

/** Indirect prompt-injection indicators. */
export const PROMPT_INJECTION_INDICATORS: readonly RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|prior)\s+instructions?/i,
  /system\s+prompt\s*:/i,
  /you\s+are\s+now\s+(?:an?\s+)?/i,
  /new\s+instructions?\s*:/i,
  /override\s+(?:all\s+)?(?:safety|system)\s+rules?/i,
  /<\/?candidate_resume/i,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface PromptInjectionResult {
  readonly injected: boolean;
  readonly matched: string | null;
}

/** Scan candidate text for indirect prompt injection attempts. */
export function detectPromptInjection(text: string | null | undefined): PromptInjectionResult {
  if (!text) {
    return { injected: false, matched: null };
  }

  for (const pattern of PROMPT_INJECTION_INDICATORS) {
    const match = pattern.exec(text);
    if (match) {
      return { injected: true, matched: match[0] };
    }
  }

  return { injected: false, matched: null };
}

export interface SanitizeTextOptions {
  readonly candidateName?: string | null;
  readonly candidateId?: string | null;
  /** False for vector embeddings: static placeholders, no reversible map. */
  readonly preserveReversibleMapping?: boolean;
}

export class PiiSanitizer {
  private readonly tokenToValue = new Map<string, string>();
  private readonly valueToToken = new Map<string, string>();
  private counter = 1;

  private getOrCreateToken(value: string, tokenPrefix: string): string {
    const cleanValue = value.trim();
    const existing = this.valueToToken.get(cleanValue);
    if (existing) {
      return existing;
    }

    const token = `[${tokenPrefix}_${this.counter}]`;
    this.counter += 1;
    this.valueToToken.set(cleanValue, token);
    this.tokenToValue.set(token, cleanValue);
    return token;
  }

  /** Sanitize emails, phones, URLs, addresses and candidate names. */
  sanitizeText(text: string | null | undefined, options: SanitizeTextOptions = {}): string {
    if (!text) {
      return '';
    }

    const preserve = options.preserveReversibleMapping ?? true;
    const candidateName = options.candidateName?.trim() ?? '';
    const candidateId = options.candidateId ?? null;
    let sanitized = text;

    // 1. Neutralize XML tag injection attempts.
    sanitized = sanitized.replaceAll('<candidate_resume', '&lt;candidate_resume');
    sanitized = sanitized.replaceAll('</candidate_resume', '&lt;/candidate_resume');

    // 2. Emails first, so partial name fragments cannot break an address.
    sanitized = sanitized.replace(EMAIL_REGEX, (value) =>
      preserve ? this.getOrCreateToken(value, 'REDACTED_EMAIL') : '[REDACTED_EMAIL]',
    );

    // 3. Phone numbers, skipping years and short digit groups.
    sanitized = sanitized.replace(PHONE_REGEX, (value) => {
      const digits = value.replace(/\D/g, '');
      if (digits.length === 4 && (digits.startsWith('19') || digits.startsWith('20'))) {
        return value;
      }
      if (digits.length < 7) {
        return value;
      }
      return preserve ? this.getOrCreateToken(value, 'REDACTED_PHONE') : '[REDACTED_PHONE]';
    });

    // 4. URLs.
    sanitized = sanitized.replace(URL_REGEX, (value) =>
      preserve ? this.getOrCreateToken(value, 'REDACTED_URL') : '[REDACTED_URL]',
    );

    // 5. Physical addresses.
    sanitized = sanitized.replace(ADDRESS_REGEX, (value) =>
      preserve ? this.getOrCreateToken(value, 'REDACTED_LOCATION') : '[REDACTED_LOCATION]',
    );

    // 6. Candidate name, then individual name parts.
    if (candidateName) {
      const opaqueName = `[CANDIDATE_${candidateId ?? 'ANONYMOUS'}]`;
      if (preserve) {
        this.tokenToValue.set(opaqueName, candidateName);
        this.valueToToken.set(candidateName, opaqueName);
      }

      sanitized = sanitized.replace(new RegExp(escapeRegExp(candidateName), 'gi'), opaqueName);
      for (const part of candidateName.split(/\s+/)) {
        if (part.length > 2 && !NAME_STOPWORDS.has(part.toLowerCase())) {
          sanitized = sanitized.replace(
            new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'),
            opaqueName,
          );
        }
      }
    }

    return sanitized;
  }

  /** Reverse opaque tokens back to real values for client/UI rendering. */
  restoreText(text: string | null | undefined): string {
    if (!text || this.tokenToValue.size === 0) {
      return text ?? '';
    }

    let restored = text;
    for (const [token, value] of this.tokenToValue) {
      restored = restored.replaceAll(token, value);
    }
    return restored;
  }
}

/** Stateless sanitizer used by the embedding path across the process. */
const GLOBAL_SANITIZER = new PiiSanitizer();

/**
 * Stateless PII redaction designed for pgvector embeddings, eliminating PII
 * exposure and vector inversion attacks.
 */
export function redactPiiForEmbedding(text: string, candidateName?: string | null): string {
  return GLOBAL_SANITIZER.sanitizeText(text, {
    ...(candidateName ? { candidateName } : {}),
    preserveReversibleMapping: false,
  });
}
