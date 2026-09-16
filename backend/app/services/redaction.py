"""
backend/app/services/redaction.py
---------------------------------
Enterprise PII minimization, redaction choke point, and indirect prompt injection defense.
Ensures zero candidate PII is leaked to external LLM providers or vector embeddings,
and sanitizes adversarial instructions in resume text (AI-SEC-2, AI-SEC-4).
"""

import re
from typing import Dict, List, Optional, Tuple

# Robust regex patterns for candidate PII
EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", re.IGNORECASE)
PHONE_REGEX = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b"
)
URL_REGEX = re.compile(
    r"https?://(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*",
    re.IGNORECASE
)
ADDRESS_REGEX = re.compile(
    r"\b(?:\d{1,5}\s+[\w\s]{1,25}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct)\b|\b\d{5}(?:-\d{4})?\b)",
    re.IGNORECASE
)

# Indirect prompt injection indicators
PROMPT_INJECTION_INDICATORS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?", re.IGNORECASE),
    re.compile(r"disregard\s+(?:all\s+)?(?:previous|prior)\s+instructions?", re.IGNORECASE),
    re.compile(r"system\s+prompt\s*:", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+(?:an?\s+)?", re.IGNORECASE),
    re.compile(r"new\s+instructions?\s*:", re.IGNORECASE),
    re.compile(r"override\s+(?:all\s+)?(?:safety|system)\s+rules?", re.IGNORECASE),
    re.compile(r"<\/?candidate_resume", re.IGNORECASE),  # Tag escaping attempts
]


def detect_prompt_injection(text: str) -> Tuple[bool, Optional[str]]:
    """
    Scans candidate text for indirect prompt injection attempts.
    Returns (is_injected, matched_pattern).
    """
    if not text:
        return False, None

    for pattern in PROMPT_INJECTION_INDICATORS:
        match = pattern.search(text)
        if match:
            return True, match.group(0)

    return False, None


class PiiSanitizer:
    """
    Manages stateful reversible PII redaction for a single LLM request/turn.
    Maintains a bi-directional mapping so recruiter-facing UIs render real names
    while LLM prompts only ever observe opaque tokens.
    """

    def __init__(self):
        self.token_to_value: Dict[str, str] = {}
        self.value_to_token: Dict[str, str] = {}
        self._counter: int = 1

    def _get_or_create_token(self, value: str, token_prefix: str) -> str:
        clean_val = value.strip()
        if clean_val in self.value_to_token:
            return self.value_to_token[clean_val]

        token = f"[{token_prefix}_{self._counter}]"
        self._counter += 1
        self.value_to_token[clean_val] = token
        self.token_to_value[token] = clean_val
        return token

    def sanitize_text(
        self,
        text: str,
        candidate_name: Optional[str] = None,
        candidate_id: Optional[str] = None,
        preserve_reversible_mapping: bool = True,
    ) -> str:
        """
        Sanitizes emails, phones, URLs, addresses, and candidate names from text.
        If preserve_reversible_mapping is False (e.g. for vector embeddings),
        opaque static placeholders are substituted without storing reversible mapping.
        """
        if not text:
            return ""

        sanitized = text

        # 1. Neutralize XML tag injection attempts
        sanitized = sanitized.replace("<candidate_resume", "&lt;candidate_resume")
        sanitized = sanitized.replace("</candidate_resume", "&lt;/candidate_resume")

        # 2. Redact Emails (run first to avoid partial name fragments breaking emails)
        def _replace_email(match):
            val = match.group(0)
            if preserve_reversible_mapping:
                return self._get_or_create_token(val, "REDACTED_EMAIL")
            return "[REDACTED_EMAIL]"

        sanitized = EMAIL_REGEX.sub(_replace_email, sanitized)

        # 3. Redact Phone numbers
        def _replace_phone(match):
            val = match.group(0)
            # Filter out false positives (e.g. standard 4-digit years like 2024)
            digits = re.sub(r"\D", "", val)
            if len(digits) in (4,) and (digits.startswith("19") or digits.startswith("20")):
                return val
            if len(digits) < 7:
                return val
            if preserve_reversible_mapping:
                return self._get_or_create_token(val, "REDACTED_PHONE")
            return "[REDACTED_PHONE]"

        sanitized = PHONE_REGEX.sub(_replace_phone, sanitized)

        # 4. Redact URLs
        def _replace_url(match):
            val = match.group(0)
            if preserve_reversible_mapping:
                return self._get_or_create_token(val, "REDACTED_URL")
            return "[REDACTED_URL]"

        sanitized = URL_REGEX.sub(_replace_url, sanitized)

        # 5. Redact Physical Addresses
        def _replace_address(match):
            val = match.group(0)
            if preserve_reversible_mapping:
                return self._get_or_create_token(val, "REDACTED_LOCATION")
            return "[REDACTED_LOCATION]"

        sanitized = ADDRESS_REGEX.sub(_replace_address, sanitized)

        # 6. Redact Candidate Name
        if candidate_name and candidate_name.strip():
            c_name = candidate_name.strip()
            opaque_name = f"[CANDIDATE_{candidate_id or 'ANONYMOUS'}]"
            if preserve_reversible_mapping:
                self.token_to_value[opaque_name] = c_name
                self.value_to_token[c_name] = opaque_name
            # Replace full name and first/last name if sufficiently distinct
            sanitized = re.sub(re.escape(c_name), opaque_name, sanitized, flags=re.IGNORECASE)
            parts = c_name.split()
            for part in parts:
                if len(part) > 2 and not part.lower() in ("the", "and", "van", "von", "del"):
                    sanitized = re.sub(rf"\b{re.escape(part)}\b", opaque_name, sanitized, flags=re.IGNORECASE)

        return sanitized

    def restore_text(self, text: str) -> str:
        """
        Reverses opaque tokens back to real values for client/UI rendering.
        """
        if not text or not self.token_to_value:
            return text

        restored = text
        for token, val in self.token_to_value.items():
            restored = restored.replace(token, val)

        return restored


# Global helper for stateless / embedding redaction
_GLOBAL_SANITIZER = PiiSanitizer()


def redact_pii_for_embedding(text: str, candidate_name: Optional[str] = None) -> str:
    """
    Stateless redaction designed for pgvector embeddings to eliminate
    PII exposure and vector inversion attacks.
    """
    return _GLOBAL_SANITIZER.sanitize_text(
        text,
        candidate_name=candidate_name,
        preserve_reversible_mapping=False,
    )
