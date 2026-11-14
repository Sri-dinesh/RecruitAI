import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { ensureValidUuid } from '../auth/index.js';
import { getConfig, type AppConfig } from '../config/index.js';
import {
  createWorkspaceStore,
  type CandidateRecord,
  type WorkspaceStore,
} from '../db/workspace-store.js';
import { chunkResume } from '../rag/chunking.js';
import { embedTexts, type EmbeddingOptions } from '../rag/embeddings.js';
import type { Candidate } from '../schemas/candidate.js';
import { jobDescriptionSchema, type JobDescription } from '../schemas/jd.js';
import { createLogger } from '../telemetry/logger.js';
import { parseDocument } from './document-parser.js';
import { parseStructuredJd } from './jd-parser.js';
import { evaluateCandidateAgainstJd } from './matching.js';
import { parseStructuredResume } from './resume-parser.js';

const logger = createLogger('recruitai.ingestion');

/**
 * Port of `backend/app/services/ingestion_service.py`.
 *
 * Preserved behavior:
 * - deterministic SHA-256 resume deduplication (normalized text, minimum 20
 *   characters) before the verified-email fallback;
 * - candidate metadata shape and session association (`session_id`,
 *   `session_ids`);
 * - immediate scoring against the session's active JD, updating both
 *   `applications` and candidate metadata;
 * - chunk + embed + replace `resume_chunks` for the candidate.
 *
 * Every write goes through `WorkspaceStore`, so PostgreSQL and the SQLite
 * fallback share one implementation.
 */

export const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.txt',
  '.text',
  '.png',
  '.jpg',
  '.jpeg',
] as const;

export const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.docx',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasPrefix(buffer: Buffer, bytes: readonly number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * Resolve the filename and extension from the name, Content-Type or magic
 * bytes. Android cache uploads often arrive without an extension.
 */
export function resolveFilenameAndExtension(
  filename: string,
  contentType: string,
  fileBytes: Buffer,
): { filename: string; extension: string } {
  const extension = filename ? extname(filename).toLowerCase() : '';
  if (extension) {
    return { filename, extension };
  }

  let inferred = CONTENT_TYPE_EXTENSIONS[(contentType || '').toLowerCase()] ?? '';
  if (!inferred) {
    if (fileBytes.subarray(0, 4).toString('latin1') === '%PDF') {
      inferred = '.pdf';
    } else if (hasPrefix(fileBytes, [0x50, 0x4b, 0x03, 0x04])) {
      inferred = '.docx';
    } else if (hasPrefix(fileBytes, [0x89, 0x50, 0x4e, 0x47])) {
      inferred = '.png';
    } else if (hasPrefix(fileBytes, [0xff, 0xd8, 0xff])) {
      inferred = '.jpg';
    } else {
      inferred = '.txt';
    }
  }

  const baseName = filename.trim() || 'candidate_document';
  const cleanName = baseName.endsWith(inferred) ? baseName : `${baseName}${inferred}`;
  return { filename: cleanName, extension: inferred };
}

/** SHA-256 of normalized resume text, used for deterministic deduplication. */
export function computeResumeHash(rawText: string | null | undefined): string | null {
  if (!rawText) {
    return null;
  }
  const normalized = rawText.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized.length < 20) {
    return null;
  }
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOr(source: Record<string, unknown>, key: string, fallback: unknown): unknown {
  return Object.hasOwn(source, key) ? source[key] : fallback;
}

/**
 * Rebuild a Candidate from a `candidates` row, as Python does before scoring.
 * Python's reshaped `Candidate` only carries the fields below; the remaining
 * defaults are required by the TypeScript type and are not read by scoring.
 */
function candidateFromRecord(record: CandidateRecord): Candidate {
  const metadata = record.metadata;
  return {
    candidate_id: record.id,
    name: record.fullName,
    raw_text: record.rawResumeText ?? '',
    match_score: null,
    matched_skills: [],
    gaps: [],
    experience_years: nullableNumber(getOr(metadata, 'experience_years', 0)),
    red_flags: [],
    email: null,
    phone: null,
    location: null,
    headline: null,
    summary: null,
    skills: stringList(getOr(metadata, 'skills', [])),
    work_experience: stringList(getOr(metadata, 'work_experience', [])),
    education: stringList(getOr(metadata, 'education', [])),
    certifications: stringList(getOr(metadata, 'certifications', [])),
    links: [],
    languages: [],
    consent_at: null,
    consent_version: '1.0',
    source: 'direct_upload',
  };
}

export interface IngestionServiceOptions {
  readonly config?: AppConfig;
  readonly store?: WorkspaceStore;
  /** Embedding injection for tests; defaults to the Gemini embedder. */
  readonly embedTexts?: (texts: readonly string[]) => Promise<number[][]>;
  readonly embeddingOptions?: EmbeddingOptions;
  /** Document text extraction injection for tests. */
  readonly parseDocumentImpl?: typeof parseDocument;
  /** Resume parsing injection for tests. */
  readonly parseResumeImpl?: (rawText: string, filename: string) => Promise<Candidate>;
  /** JD parsing injection for tests. */
  readonly parseJdImpl?: (rawText: string, filename: string) => Promise<JobDescription>;
  readonly now?: () => Date;
}

export class IngestionService {
  private readonly config: AppConfig;
  private readonly embeddingOptions: EmbeddingOptions;
  private readonly embed: (texts: readonly string[]) => Promise<number[][]>;
  private readonly parseDocumentImpl: typeof parseDocument;
  private readonly parseResumeImpl: (rawText: string, filename: string) => Promise<Candidate>;
  private readonly parseJdImpl: (rawText: string, filename: string) => Promise<JobDescription>;
  private readonly now: () => Date;
  private store: WorkspaceStore | undefined;

  constructor(options: IngestionServiceOptions = {}) {
    this.config = options.config ?? getConfig();
    this.embeddingOptions = options.embeddingOptions ?? {};
    this.embed =
      options.embedTexts ??
      ((texts) => embedTexts(texts, { config: this.config, ...this.embeddingOptions }));
    this.parseDocumentImpl = options.parseDocumentImpl ?? parseDocument;
    this.parseResumeImpl =
      options.parseResumeImpl ?? ((rawText, filename) => parseStructuredResume(rawText, filename));
    this.parseJdImpl =
      options.parseJdImpl ?? ((rawText, filename) => parseStructuredJd(rawText, filename));
    this.now = options.now ?? (() => new Date());
    this.store = options.store;
  }

  private getStore(): WorkspaceStore {
    this.store ??= createWorkspaceStore({ config: this.config });
    return this.store;
  }

  /** `ingest_candidate_object` normalizes the local dev id to a real UUID. */
  private normalizeUserId(userId?: string | null): string {
    if (!userId || userId === 'local_dev_user_123') {
      return ensureValidUuid(this.config.auth.localDevUserId);
    }
    return ensureValidUuid(userId);
  }

  /** Extract and deterministically parse a resume; unreadable files degrade. */
  async parseResume(fileBytes: Buffer, filename: string): Promise<Candidate> {
    let rawText: string;
    try {
      rawText = await this.parseDocumentImpl(fileBytes, filename);
    } catch (error) {
      logger.warn(
        `[ingestion] Local text extraction failed for ${filename}: ${errorMessage(error)}`,
      );
      rawText = 'Empty Resume';
    }
    return this.parseResumeImpl(rawText, filename);
  }

  /** Extract raw text from a JD document (throws, so the route can map it). */
  async extractText(fileBytes: Buffer, filename: string): Promise<string> {
    return this.parseDocumentImpl(fileBytes, filename);
  }

  /** Parse raw JD text into the structured model. */
  async parseJobDescription(rawText: string, filename: string): Promise<JobDescription> {
    return this.parseJdImpl(rawText, filename);
  }

  /**
   * Upsert one candidate, deduplicating by resume hash then verified email and
   * merging session associations. Returns the persistent candidate UUID.
   */
  async upsertCandidateRecord(
    candidate: Candidate,
    userId: string,
    sessionId: string | null = null,
  ): Promise<string> {
    const store = this.getStore();
    const tenantId = ensureValidUuid(userId);

    let email = candidate.email;
    if (!email || !email.includes('@')) {
      const fallbackTag = candidate.candidate_id || randomUUID().replaceAll('-', '').slice(0, 8);
      email = `${fallbackTag}@recruitai.local`;
    }

    const rawText = candidate.raw_text || '';
    const resumeHash = computeResumeHash(rawText);

    const metadata: Record<string, unknown> = {
      resume_hash: resumeHash,
      skills: candidate.skills ?? [],
      work_experience: candidate.work_experience ?? [],
      education: candidate.education ?? [],
      summary: candidate.summary,
      experience_years: candidate.experience_years,
      location: candidate.location,
      matched_skills: candidate.matched_skills ?? [],
      gaps: candidate.gaps ?? [],
      match_score: candidate.match_score,
      red_flags: candidate.red_flags ?? [],
      headline: candidate.headline,
      certifications: candidate.certifications ?? [],
      languages: candidate.languages ?? [],
      consent_at: candidate.consent_at || this.now().toISOString(),
      consent_version: candidate.consent_version || '1.0',
      source: candidate.source || 'direct_upload',
    };
    if (sessionId) {
      metadata.session_id = sessionId;
      metadata.session_ids = [sessionId];
    }

    try {
      let existing: CandidateRecord | undefined;

      // 1. Primary deduplication: SHA-256 hash of normalized resume text.
      if (resumeHash) {
        const rows = await store.listCandidates(tenantId);
        existing = rows.find((row) => row.metadata.resume_hash === resumeHash);
      }

      // 2. Secondary deduplication: verified non-local email address.
      if (!existing && email && !email.endsWith('@recruitai.local') && email.includes('@')) {
        existing = await store.findCandidateByEmail(tenantId, email);
      }

      let candidateId: string;
      if (existing) {
        candidateId = existing.id;
        const merged = new Set<string>(stringList(existing.metadata.session_ids));
        if (sessionId) {
          merged.add(sessionId);
          metadata.session_id = sessionId;
        }
        metadata.session_ids = [...merged];

        await store.updateCandidate(tenantId, candidateId, {
          fullName: candidate.name,
          phone: candidate.phone,
          rawResumeText: candidate.raw_text,
          metadata,
        });
      } else {
        candidateId = randomUUID();
        await store.insertCandidate({
          id: candidateId,
          userId: tenantId,
          fullName: candidate.name,
          email,
          phone: candidate.phone,
          rawResumeText: candidate.raw_text,
          metadata,
        });
      }

      if (sessionId) {
        const linked = await store.upsertSessionCandidate(tenantId, sessionId, candidateId);
        if (!linked) {
          logger.warn(
            `[ingestion] Could not link candidate ${candidateId} to session ${sessionId}`,
          );
        }
      }

      return candidateId;
    } catch (error) {
      logger.warn(`[ingestion] Warning: Error upserting candidate to DB: ${errorMessage(error)}`);
      return candidate.candidate_id ? ensureValidUuid(candidate.candidate_id) : randomUUID();
    }
  }

  /**
   * Insert a job description and, when a session is supplied, bind it to the
   * campaign and score every candidate already associated with that session.
   */
  async saveJobDescription(
    jd: JobDescription,
    userId: string,
    options: { rawText?: string; sessionId?: string | null } = {},
  ): Promise<string> {
    const store = this.getStore();
    const tenantId = ensureValidUuid(userId);
    const jobId = randomUUID();
    const title = jd.role || 'Hiring Campaign';
    const rawText = options.rawText ?? '';
    const sessionId = options.sessionId ?? null;

    try {
      await store.insertJob({
        id: jobId,
        userId: tenantId,
        title,
        rawJd: rawText || jd.raw_text || '',
        jdStructured: jd as unknown as Record<string, unknown>,
        status: 'active',
      });

      if (sessionId) {
        await store.bindJobToSession(tenantId, sessionId, jobId, `Hiring: ${title}`);

        // Score candidates already belonging to this campaign session.
        const rows = await store.listCandidates(tenantId);
        for (const row of rows) {
          const metadata = row.metadata;
          const sessionIds = stringList(metadata.session_ids);
          if (metadata.session_id !== sessionId && !sessionIds.includes(sessionId)) {
            continue;
          }

          const scored = evaluateCandidateAgainstJd(candidateFromRecord(row), jd);
          await store.upsertApplication({
            jobId,
            candidateId: row.id,
            userId: tenantId,
            matchScore: scored.match_score ?? 0,
            matchReasoning: {
              matched_skills: scored.matched_skills ?? [],
              gaps: scored.gaps ?? [],
              red_flags: scored.red_flags ?? [],
              summary: scored.summary,
            },
            status: 'new',
          });

          metadata.match_score = scored.match_score;
          metadata.matched_skills = scored.matched_skills;
          metadata.gaps = scored.gaps;
          metadata.red_flags = scored.red_flags;
          metadata.summary = scored.summary;
          await store.updateCandidate(tenantId, row.id, {
            fullName: row.fullName,
            phone: row.phone,
            rawResumeText: row.rawResumeText,
            metadata,
          });
        }
      }
    } catch (error) {
      logger.warn(`[ingestion] Warning: Error saving job to DB: ${errorMessage(error)}`);
    }

    return jobId;
  }

  /**
   * Ingest a parsed candidate: upsert, score against the session JD, then
   * chunk/embed and replace the candidate's vector rows.
   */
  async ingestCandidateObject(
    candidate: Candidate,
    userId?: string | null,
    sessionId: string | null = null,
  ): Promise<Candidate> {
    const store = this.getStore();
    const tenantId = this.normalizeUserId(userId);
    const rawText = candidate.raw_text || '';
    const candidateId = await this.upsertCandidateRecord(candidate, tenantId, sessionId);
    candidate.candidate_id = candidateId;

    if (sessionId) {
      try {
        const jobId = await store.findSessionJobId(tenantId, sessionId);
        if (jobId) {
          const structured = await store.findJobStructured(tenantId, jobId);
          if (structured) {
            const jd = jobDescriptionSchema.parse(structured);
            const scored = evaluateCandidateAgainstJd(candidate, jd);
            candidate.match_score = scored.match_score;
            candidate.matched_skills = scored.matched_skills;
            candidate.gaps = scored.gaps;
            candidate.red_flags = scored.red_flags;
            candidate.summary = scored.summary;

            await store.upsertApplication({
              jobId,
              candidateId,
              userId: tenantId,
              matchScore: scored.match_score ?? 0,
              matchReasoning: {
                matched_skills: scored.matched_skills ?? [],
                gaps: scored.gaps ?? [],
                red_flags: scored.red_flags ?? [],
                summary: scored.summary,
              },
              status: 'new',
            });

            const current = await store.findCandidateById(tenantId, candidateId);
            if (current) {
              const metadata = current.metadata;
              metadata.match_score = scored.match_score;
              metadata.matched_skills = scored.matched_skills;
              metadata.gaps = scored.gaps;
              metadata.red_flags = scored.red_flags;
              metadata.summary = scored.summary;
              await store.updateCandidate(tenantId, candidateId, {
                fullName: current.fullName,
                phone: current.phone,
                rawResumeText: current.rawResumeText,
                metadata,
              });
            }
          }
        }
      } catch (error) {
        logger.warn(
          `[ingestion] Non-fatal error auto-scoring candidate against session JD: ${errorMessage(
            error,
          )}`,
        );
      }
    }

    if (!rawText) {
      return candidate;
    }

    const rawChunks = chunkResume(rawText, candidateId, candidate.name);
    if (rawChunks.length === 0) {
      return candidate;
    }

    const embeddings = await this.embed(rawChunks.map((chunk) => chunk.chunk_text));
    const records = rawChunks.map((chunk, index) => ({
      candidateId,
      userId: tenantId,
      chunkText: chunk.chunk_text,
      chunkIndex: index,
      embedding: embeddings[index] ?? new Array<number>(384).fill(0),
    }));

    try {
      await store.deleteResumeChunks(tenantId, candidateId);
    } catch (error) {
      logger.warn(`[ingest] Chunks pre-delete notice for ${candidateId}: ${errorMessage(error)}`);
    }

    await store.insertResumeChunks(records);
    return candidate;
  }

  /** Parse raw candidate text into a Candidate and ingest it. */
  async ingestSingleCandidateText(
    candidateId: string,
    name: string,
    rawText: string,
    userId = 'local_dev_user_123',
  ): Promise<Candidate> {
    const candidate = await parseStructuredResume(rawText, `${candidateId}.txt`);
    candidate.candidate_id = candidateId;
    if (name && name !== 'Unknown Candidate') {
      candidate.name = name;
    }
    return this.ingestCandidateObject(candidate, userId);
  }
}

export function createIngestionService(options: IngestionServiceOptions = {}): IngestionService {
  return new IngestionService(options);
}
