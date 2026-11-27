import { createHash } from 'node:crypto';

/**
 * Port of `routes_evaluate.py::_to_uuid_str`.
 *
 * PostgreSQL `uuid` columns reject arbitrary identifiers, so Python derives a
 * deterministic UUIDv5 for anything that is not already a UUID. The same
 * derivation is required here: the evaluate/ATS routes must address exactly the
 * rows the Python backend would have written.
 */

/** `uuid.NAMESPACE_DNS` from RFC 4122. */
const NAMESPACE_DNS = Uint8Array.from([
  0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_UUID = /^[0-9a-f]{32}$/i;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * `uuid.UUID(value)` accepts the canonical form, 32 hex digits, braces and the
 * `urn:uuid:` prefix. Return the canonical lowercase form, or `undefined`.
 */
function parseUuid(value: string): string | undefined {
  let text = value.trim();
  if (/^urn:uuid:/i.test(text)) {
    text = text.slice('urn:uuid:'.length);
  }
  if (text.startsWith('{') && text.endsWith('}')) {
    text = text.slice(1, -1);
  }
  if (CANONICAL_UUID.test(text)) {
    return text.toLowerCase();
  }
  if (HEX_UUID.test(text)) {
    const hex = text.toLowerCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return undefined;
}

/** RFC 4122 §4.3 name-based UUID (SHA-1, version 5). */
export function uuidV5(name: string): string {
  const digest = createHash('sha1')
    .update(NAMESPACE_DNS)
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Canonical UUID when possible, otherwise the deterministic UUIDv5. */
export function toUuidStr(value: string): string {
  return parseUuid(String(value)) ?? uuidV5(String(value));
}

/** Exported for regression tests against Python's derivation. */
export const UUID_NAMESPACE_DNS_HEX = bytesToHex(NAMESPACE_DNS);
