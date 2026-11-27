import PDFDocument from 'pdfkit';

import { getConfig } from '../config/index.js';
import { getWorkerPool } from '../workers/pool.js';

/**
 * Port of `backend/app/services/report_generator.py`.
 *
 * ReportLab is replaced by PDFKit, but the document keeps the same structure
 * and intent:
 *
 *   1. Executive banner (blind-mode badge, target role, generated at, auditor)
 *   2. Executive KPI funnel
 *   3. Position calibration table
 *   4. Candidate stack-ranking matrix
 *   5. Interview guide (page break before it)
 *   6. Salary benchmark box
 *   7. Interview coordination log
 *   8. AI governance / compliance notice
 *
 * Running headers start on page 2 and every page carries the confidentiality
 * footer plus "Page X of Y", matching `NumberedCanvas`.
 */

export interface RecruitmentReportOptions {
  readonly jd?: Record<string, unknown> | null;
  readonly shortlist?: ReadonlyArray<Record<string, unknown>>;
  readonly interviewQuestions?: string;
  readonly salaryData?: string;
  readonly candidates?: ReadonlyArray<Record<string, unknown>>;
  readonly evaluations?: Record<string, unknown> | null;
  readonly scheduledInterviews?: ReadonlyArray<Record<string, unknown>>;
  readonly isBlindMode?: boolean;
  readonly sessionTitle?: string | null;
  readonly recruiterName?: string | null;
  readonly now?: Date;
}

const PAGE_WIDTH = 612; // US Letter, 8.5in
const PAGE_HEIGHT = 792; // US Letter, 11in
const LEFT = 36;
const RIGHT = 36;
const TOP = 45;
const BOTTOM = 45;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;

const COLORS = {
  emerald: '#059669',
  navy: '#0F172A',
  slate: '#334155',
  muted: '#64748B',
  border: '#CBD5E1',
  lightBg: '#F8FAFC',
  kpiBg: '#F1F5F9',
  amber: '#D97706',
  indigo: '#4F46E5',
  red: '#DC2626',
  white: '#FFFFFF',
  amberBg: '#FFFBEB',
  emeraldBg: '#ECFDF5',
} as const;

const BODY_SIZE = 8.5;
const BODY_LEADING = 12;

/**
 * PDFKit's built-in Helvetica uses WinAnsi encoding. Normalise typographic
 * characters and drop anything that cannot be encoded, so a candidate name
 * never makes report generation fail.
 */
export function safePdfText(value: unknown): string {
  const source = value === null || value === undefined ? '' : String(value);
  const cleaned = source
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25cf]/g, '-')
    .replace(/\u00a0/g, ' ');
  // Drop C0 control characters (except \n and \t) and anything outside
  // WinAnsi's first 256 code points.
  return Array.from(cleaned)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      if (code === 0x0a || code === 0x09) {
        return true;
      }
      return code >= 0x20 && code <= 0xff;
    })
    .join('');
}

/** Markdown inline syntax flattened to plain text (PDFKit handles styling). */
export function stripMarkdown(value: unknown): string {
  return safePdfText(value)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '- ');
}

/** Python `mask_candidate_name`: "Ada Lovelace" -> "Candidate #1 (A.L.)". */
export function maskCandidateName(name: unknown, index = 1): string {
  const clean = safePdfText(name).trim();
  if (!clean) {
    return `Candidate #${index}`;
  }
  const initials = clean
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join('');
  return `Candidate #${index} (${initials})`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown): string[] {
  return asList(value).map((item) => safePdfText(item));
}

function dateLabel(now: Date): string {
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const day = now.toISOString().slice(8, 10);
  const year = now.toISOString().slice(0, 4);
  const time = now.toISOString().slice(11, 16);
  return `${month} ${day}, ${year} - ${time} UTC`;
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

interface Column {
  readonly label: string;
  readonly width: number;
}

interface TableOptions {
  readonly headerFill?: string;
  readonly headerColor?: string;
  readonly stripe?: boolean;
  readonly fontSize?: number;
  /** Set false for border-only tables (Python's calibration grid). */
  readonly header?: boolean;
}

/** Draw one row group at the current `doc.y`, returning the height consumed. */
function drawTable(
  doc: PDFKit.PDFDocument,
  columns: ReadonlyArray<Column>,
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
  options: TableOptions = {},
): void {
  const padding = 4.5;
  const fontSize = options.fontSize ?? 8;
  const headerHeight = (): number => {
    const height = Math.max(
      ...headers.map((header, index) =>
        doc.heightOfString(safePdfText(header), {
          width: Math.max(10, (columns[index]?.width ?? 40) - padding * 2),
          lineGap: 1,
        }),
      ),
    );
    return height + padding * 2;
  };
  const rowHeight = (cells: ReadonlyArray<string>): number => {
    const height = Math.max(
      ...cells.map((cell, index) =>
        doc.heightOfString(safePdfText(cell), {
          width: Math.max(10, (columns[index]?.width ?? 40) - padding * 2),
          lineGap: 1,
        }),
      ),
    );
    return height + padding * 2;
  };
  const available = (): number => PAGE_HEIGHT - BOTTOM - doc.y;
  const drawHeader = (): void => {
    const height = headerHeight();
    const startX = LEFT;
    const top = doc.y;
    doc.save();
    doc.rect(startX, top, CONTENT_WIDTH, height).fill(options.headerFill ?? COLORS.navy);
    let x = startX;
    doc
      .fillColor(options.headerColor ?? COLORS.white)
      .font('Helvetica-Bold')
      .fontSize(fontSize);
    for (const [index, column] of columns.entries()) {
      doc.text(safePdfText(headers[index] ?? ''), x + padding, top + padding, {
        width: column.width - padding * 2,
        lineGap: 1,
      });
      x += column.width;
    }
    doc.restore();
    doc.y = top + height;
  };
  const drawRow = (cells: ReadonlyArray<string>, striped: boolean): void => {
    const height = rowHeight(cells);
    const top = doc.y;
    if (striped) {
      doc.save();
      doc.rect(LEFT, top, CONTENT_WIDTH, height).fill(COLORS.lightBg);
      doc.restore();
    }
    let x = LEFT;
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(fontSize);
    for (const [index, column] of columns.entries()) {
      doc.text(safePdfText(cells[index] ?? ''), x + padding, top + padding, {
        width: column.width - padding * 2,
        lineGap: 1,
      });
      x += column.width;
    }
    doc
      .save()
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .rect(LEFT, top, CONTENT_WIDTH, height)
      .stroke()
      .restore();
    doc.y = top + height;
  };

  const withHeader = options.header !== false;
  if (withHeader) {
    if (available() < headerHeight() + 24) {
      doc.addPage();
    }
    drawHeader();
  }
  for (const [index, cells] of rows.entries()) {
    const height = rowHeight(cells);
    if (available() < height + 2) {
      doc.addPage();
      if (withHeader) {
        drawHeader();
      }
    }
    drawRow(cells, options.stripe === true && index % 2 === 1);
  }
  // Vertical separators are drawn per row; outer box for the last row is
  // already included, so only the header/body split needs a line.
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  if (PAGE_HEIGHT - BOTTOM - doc.y < 48) {
    doc.addPage();
  }
  doc.moveDown(0.8);
  doc
    .fillColor(COLORS.navy)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(safePdfText(title), LEFT, doc.y);
  doc.moveDown(0.35);
}

function bodyText(
  doc: PDFKit.PDFDocument,
  text: string,
  options: { readonly bold?: boolean; readonly color?: string; readonly indent?: number } = {},
): void {
  const width = CONTENT_WIDTH - (options.indent ?? 0);
  const height = doc.heightOfString(safePdfText(text), { width, lineGap: 2 });
  if (PAGE_HEIGHT - BOTTOM - doc.y < Math.min(height, BODY_LEADING * 2)) {
    doc.addPage();
  }
  doc
    .fillColor(options.color ?? COLORS.slate)
    .font(options.bold === true ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(BODY_SIZE)
    .text(safePdfText(text), LEFT + (options.indent ?? 0), doc.y, { width, lineGap: 2 });
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (PAGE_HEIGHT - BOTTOM - doc.y < height) {
    doc.addPage();
  }
}

function formatMoney(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-US');
  }
  return safePdfText(value);
}

/** Compile the executive dossier. Resolves with the complete PDF bytes. */
export async function generateRecruitmentReport(
  options: RecruitmentReportOptions = {},
): Promise<Buffer> {
  const config = getConfig();
  if (config.workers.enabled) {
    const pool = getWorkerPool(config.workers);
    if (pool) {
      const bytes = await pool.run<Uint8Array>('renderReport', options);
      return Buffer.from(bytes);
    }
  }
  return renderRecruitmentReport(options);
}

/**
 * Inline PDF renderer used by the worker and by local development/test runs.
 */
export async function renderRecruitmentReport(
  options: RecruitmentReportOptions = {},
): Promise<Buffer> {
  const jd = asRecord(options.jd);
  const shortlist = asList(options.shortlist).map(asRecord);
  const candidatesInput = asList(options.candidates).map(asRecord);
  const allCandidates = candidatesInput.length > 0 ? candidatesInput : shortlist;
  const evaluations = asRecord(options.evaluations);
  const interviews = asList(options.scheduledInterviews).map(asRecord);
  const isBlindMode = options.isBlindMode === true;
  const now = options.now ?? new Date();

  const roleTitle = safePdfText(jd['role'] ?? '') || 'General Position';
  const titleText = safePdfText(options.sessionTitle ?? '') || `Hiring Campaign: ${roleTitle}`;
  const recruiter = safePdfText(options.recruiterName ?? '') || 'Lead Recruiter';

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: TOP, bottom: BOTTOM, left: LEFT, right: RIGHT },
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: `Recruitment Report - ${roleTitle}`,
      Author: 'RecruitAI Multi-Agent Recruiting Platform',
      Subject: 'Executive Candidate Assessment Dossier',
    },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.y = TOP;

  // ── 1. Executive banner ────────────────────────────────────────────────────
  const badgeLabel = isBlindMode
    ? 'Blind Mode (PII Masked)'
    : 'Standard Mode (Candidate Details Unmasked)';
  const badgeColor = isBlindMode ? COLORS.amber : COLORS.emerald;
  const badgeBg = isBlindMode ? COLORS.amberBg : COLORS.emeraldBg;
  const bannerHeight = 74;
  doc.save();
  doc.rect(LEFT, TOP, CONTENT_WIDTH, bannerHeight).fillAndStroke(COLORS.lightBg, '#E2E8F0');
  doc.restore();

  doc
    .fillColor(COLORS.emerald)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('RECRUITAI INTELLIGENT TALENT ENGINE', LEFT + 10, TOP + 10, { width: 320 });
  doc
    .fillColor(COLORS.navy)
    .font('Helvetica-Bold')
    .fontSize(17)
    .text(safePdfText(titleText), LEFT + 10, TOP + 23, { width: 320, lineGap: 2 });

  doc.save();
  doc.roundedRect(LEFT + 350, TOP + 8, 180, 18, 3).fill(badgeBg);
  doc.restore();
  doc
    .fillColor(badgeColor)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(`- ${badgeLabel}`, LEFT + 358, TOP + 13, { width: 168, align: 'left', lineBreak: false });
  doc
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .fontSize(8)
    .text(`Target Role: ${roleTitle}`, LEFT + 350, TOP + 32, { width: 180, align: 'right' })
    .fillColor('#94A3B8')
    .fontSize(7.5)
    .text(`Generated: ${dateLabel(now)}`, LEFT + 350, TOP + 45, { width: 180, align: 'right' })
    .text(`Audited By: ${recruiter}`, LEFT + 350, TOP + 56, { width: 180, align: 'right' });
  doc.y = TOP + bannerHeight + 10;

  // ── 2. Executive KPI funnel ────────────────────────────────────────────────
  const totalPoolCount = allCandidates.length;
  const highMatchCount = allCandidates.filter(
    (candidate) => Number(candidate['match_score'] ?? 0) >= 80,
  ).length;
  const shortlistedCount =
    shortlist.length > 0
      ? shortlist.length
      : allCandidates.filter((candidate) =>
          ['shortlisted', 'offered'].includes(String(candidate['status'] ?? '')),
        ).length;
  const scheduledCount = interviews.length;
  const kpis: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
    readonly color: string;
  }> = [
    { value: String(totalPoolCount), label: 'TALENT POOL', color: COLORS.navy },
    { value: String(highMatchCount), label: 'HIGH-FIT (>=80%)', color: COLORS.navy },
    { value: String(shortlistedCount), label: 'SHORTLISTED', color: COLORS.emerald },
    { value: String(scheduledCount), label: 'INTERVIEWS BOOKED', color: COLORS.indigo },
  ];
  const kpiWidth = CONTENT_WIDTH / 4;
  const kpiTop = doc.y;
  doc.save();
  doc.rect(LEFT, kpiTop, CONTENT_WIDTH, 52).fillAndStroke(COLORS.kpiBg, COLORS.border);
  for (let index = 1; index < 4; index += 1) {
    doc
      .moveTo(LEFT + kpiWidth * index, kpiTop)
      .lineTo(LEFT + kpiWidth * index, kpiTop + 52)
      .lineWidth(0.5)
      .strokeColor(COLORS.border)
      .stroke();
  }
  doc.restore();
  for (const [index, kpi] of kpis.entries()) {
    const x = LEFT + kpiWidth * index;
    doc
      .fillColor(kpi.color)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(kpi.value, x, kpiTop + 10, { width: kpiWidth, align: 'center' })
      .fillColor(COLORS.muted)
      .fontSize(7.5)
      .text(kpi.label, x, kpiTop + 34, { width: kpiWidth, align: 'center' });
  }
  doc.y = kpiTop + 52 + 10;

  // ── 3. Position calibration ────────────────────────────────────────────────
  sectionTitle(doc, '1. Position Target & Rubric Calibration');
  const experienceYears = jd['experience_years'];
  const experienceLabel =
    experienceYears === null || experienceYears === undefined
      ? 'Not specified'
      : `${safePdfText(experienceYears)}+ years`;
  const tone = safePdfText(jd['tone'] ?? '').trim();
  const skills = stringList(jd['required_skills']);
  const skillsLabel = skills.length > 0 ? skills.join(', ') : 'General Competencies';
  const summaryValue = jd['summary'] ?? jd['responsibilities'];
  const summaryLabel = Array.isArray(summaryValue)
    ? summaryValue
        .slice(0, 3)
        .map((item) => safePdfText(item))
        .join('; ')
    : safePdfText(summaryValue ?? '') || 'Production systems engineering and team delivery.';
  const calibrationRows: ReadonlyArray<readonly [string, string]> = [
    ['Target Requisition:', roleTitle],
    ['Target Experience:', experienceLabel],
    [
      'Culture & Tone:',
      tone ? `${tone.charAt(0).toUpperCase()}${tone.slice(1)}` : 'Professional / Collaborative',
    ],
    ['Core Required Skills:', skillsLabel],
    ['Position Overview:', summaryLabel],
  ];
  drawTable(
    doc,
    [
      { label: 'Field', width: 130 },
      { label: 'Value', width: CONTENT_WIDTH - 130 },
    ],
    ['', ''],
    calibrationRows.map(([label, value]) => [label, value]),
    { headerFill: COLORS.lightBg, stripe: false, fontSize: 8, header: false },
  );
  doc.y += 12;

  // ── 4. Candidate matrix ────────────────────────────────────────────────────
  sectionTitle(doc, '2. Candidate Stack-Ranking & Assessment Matrix');

  const displayCandidates: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const candidate of [...shortlist, ...allCandidates]) {
    const key = String(candidate['candidate_id'] ?? candidate['id'] ?? candidate['name'] ?? '');
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    displayCandidates.push(candidate);
  }
  displayCandidates.sort(
    (left, right) => Number(right['match_score'] ?? 0) - Number(left['match_score'] ?? 0),
  );

  if (displayCandidates.length > 0) {
    const matrixRows: string[][] = [];
    for (const [index, candidate] of displayCandidates.entries()) {
      const rawName = safePdfText(candidate['name'] ?? candidate['full_name'] ?? '');
      const displayName =
        isBlindMode && rawName
          ? maskCandidateName(rawName, index + 1)
          : rawName || `Candidate #${index + 1}`;
      const score = Math.trunc(Number(candidate['match_score'] ?? 0));
      const status = safePdfText(candidate['status'] ?? 'new');
      const statusLabel = status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : 'New';
      const evaluation = asRecord(
        evaluations[String(candidate['candidate_id'] ?? candidate['id'] ?? '')] as unknown,
      );
      const techScore = evaluation['tech_score'] ?? candidate['tech_score'];
      const commScore = evaluation['comm_score'] ?? candidate['comm_score'];
      const rubric =
        techScore !== null &&
        techScore !== undefined &&
        commScore !== null &&
        commScore !== undefined
          ? ` | Tech: ${safePdfText(techScore)}/5, Comm: ${safePdfText(commScore)}/5`
          : '';
      const matched = Array.isArray(candidate['matched_skills'])
        ? candidate['matched_skills']
        : candidate['skills'];
      const matchedLabel = Array.isArray(matched)
        ? matched
            .slice(0, 5)
            .map((skill) => safePdfText(skill))
            .join(', ')
        : safePdfText(matched ?? '');
      const gaps = Array.isArray(candidate['gaps'])
        ? candidate['gaps']
            .slice(0, 3)
            .map((gap) => safePdfText(gap))
            .join(', ')
        : safePdfText(candidate['gaps'] ?? '');
      const gapLabel = gaps || 'No critical gaps identified';
      const notes = safePdfText(evaluation['notes'] ?? candidate['summary'] ?? '');
      const notesLine = notes ? `\nNotes: ${truncate(notes, 120)}` : '';
      matrixRows.push([
        displayName,
        `${score}%`,
        `${statusLabel}${rubric}`,
        matchedLabel,
        `${gapLabel}${notesLine}`,
      ]);
    }
    drawTable(
      doc,
      [
        { label: 'Candidate Name', width: 125 },
        { label: 'Match Score', width: 65 },
        { label: 'Status & Rubric', width: 90 },
        { label: 'Verified Competencies', width: 130 },
        { label: 'Gaps & Recruiter Notes', width: 130 },
      ],
      [
        'Candidate Name',
        'Match Score',
        'Status & Rubric',
        'Verified Competencies',
        'Gaps & Recruiter Notes',
      ],
      matrixRows,
      { stripe: true, fontSize: 7.5 },
    );
  } else {
    bodyText(doc, 'No candidates currently ingested in this recruitment session.');
  }

  // ── 5. Interview guide (new page, like the Python PageBreak) ───────────────
  doc.addPage();
  sectionTitle(doc, '3. Technical & Gap-Probing Interview Questions');
  bodyText(
    doc,
    'Curated interview questions formulated by the LangGraph multi-agent supervisor ' +
      'to probe identified architecture gaps and benchmark hands-on competencies.',
    { color: COLORS.muted },
  );
  doc.moveDown(0.4);

  const questions = safePdfText(options.interviewQuestions ?? '').trim();
  if (questions) {
    for (const line of questions.split('\n')) {
      const rawLine = line.trim();
      if (!rawLine) {
        continue;
      }
      if (rawLine.startsWith('#')) {
        doc.moveDown(0.3);
        bodyText(doc, stripMarkdown(rawLine), { bold: true, color: COLORS.navy });
        doc.moveDown(0.15);
      } else if (/^[-*]\s+/.test(rawLine) || /^\d+\./.test(rawLine)) {
        bodyText(doc, `- ${stripMarkdown(rawLine).replace(/^[-*]\s+/, '')}`, { indent: 12 });
        doc.moveDown(0.2);
      } else {
        bodyText(doc, stripMarkdown(rawLine));
        doc.moveDown(0.2);
      }
    }
  } else {
    const defaultQuestions = [
      `1. Architecture & System Design: Explain the design of a scalable service relevant to ${roleTitle}. What tradeoffs did you make between consistency, latency, and operational simplicity?`,
      `2. Technical Competency Probe: In your past production experience with ${skillsLabel}, how did you diagnose and remediate a high-severity production failure or performance bottleneck?`,
      '3. Gap & Tradeoff Exploration: Looking at areas where candidate competencies diverge from ideal role specifications, describe how you ramp up on unfamiliar domain frameworks within a tight delivery deadline.',
      '4. Quality & Operational Readiness: What automated testing strategies and observability practices do you mandate before shipping mission-critical features to end users?',
    ];
    for (const question of defaultQuestions) {
      bodyText(doc, `- ${question}`, { indent: 12 });
      doc.moveDown(0.25);
    }
  }

  // ── 6. Salary benchmark ────────────────────────────────────────────────────
  doc.moveDown(0.7);
  sectionTitle(doc, '4. Target Compensation & Market Salary Benchmark');
  const salaryInput = safePdfText(options.salaryData ?? '').trim();
  const salaryText = salaryInput
    ? stripMarkdown(salaryInput)
    : `Market Compensation Range for ${roleTitle}:\n` +
      `- Base Salary Target: Competitive market median commensurate with ${experienceLabel} experience.\n` +
      `- Calibration Guidance: Premium offers reserved for candidates exceeding 80% rubric match ` +
      `with zero critical competency gaps in core stack (${skillsLabel}).`;
  const salaryHeight =
    doc.heightOfString(salaryText, { width: CONTENT_WIDTH - 14, lineGap: 2 }) + 14;
  ensureSpace(doc, salaryHeight);
  const salaryTop = doc.y;
  doc.save();
  doc
    .rect(LEFT, salaryTop, CONTENT_WIDTH, salaryHeight)
    .fillAndStroke(COLORS.lightBg, COLORS.border);
  doc.restore();
  doc
    .fillColor(COLORS.slate)
    .font('Helvetica')
    .fontSize(BODY_SIZE)
    .text(salaryText, LEFT + 7, salaryTop + 7, { width: CONTENT_WIDTH - 14, lineGap: 2 });
  doc.y = salaryTop + salaryHeight + 10;

  // ── 7. Interview coordination log ──────────────────────────────────────────
  sectionTitle(doc, '5. Confirmed Interview Coordination Log');
  if (interviews.length > 0) {
    const interviewRows = interviews.map((interview, index) => {
      const rawName = safePdfText(
        interview['candidate_name'] ?? interview['candidate_id'] ?? 'Candidate',
      );
      const name = isBlindMode ? maskCandidateName(rawName, index + 1) : rawName;
      const slot = safePdfText(interview['slot'] ?? 'TBD');
      const booked = safePdfText(interview['booked_at'] ?? 'Confirmed').slice(0, 19);
      return [name, slot, booked, 'Confirmed'];
    });
    drawTable(
      doc,
      [
        { label: 'Candidate Name', width: 150 },
        { label: 'Interview Slot / Schedule', width: 180 },
        { label: 'Booking Timestamp', width: 130 },
        { label: 'Status', width: 80 },
      ],
      ['Candidate Name', 'Interview Slot / Schedule', 'Booking Timestamp', 'Status'],
      interviewRows,
      { stripe: true, fontSize: 8 },
    );
  } else {
    bodyText(
      doc,
      'No formal interview rounds currently booked. Shortlisted candidates are ready ' +
        'for calendar slot selection via the Workspace Scheduler.',
    );
  }

  // ── 8. Compliance notice ───────────────────────────────────────────────────
  doc.moveDown(1);
  ensureSpace(doc, 60);
  doc
    .moveTo(LEFT, doc.y)
    .lineTo(LEFT + CONTENT_WIDTH, doc.y)
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .stroke();
  doc.moveDown(0.5);
  bodyText(
    doc,
    'AI Governance & Compliance Notice: This dossier was generated by the RecruitAI ' +
      'autonomous multi-agent system. All evaluations, match scores, and gap analyses serve as decision ' +
      'support recommendations and have been reviewed by a designated human recruiter in full compliance ' +
      'with EEOC non-discrimination standards and GDPR Article 22 human-in-the-loop oversight mandates.',
    { color: COLORS.muted },
  );

  // ── Running header/footer + "Page X of Y" ─────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const pageBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    if (index > 0) {
      doc
        .save()
        .fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(8)
        .text('RecruitAI | Executive Candidate Assessment Dossier', LEFT, 24, {
          lineBreak: false,
        })
        .moveTo(LEFT, 34)
        .lineTo(LEFT + CONTENT_WIDTH, 34)
        .lineWidth(0.5)
        .strokeColor('#E2E8F0')
        .stroke()
        .restore();
    }

    doc
      .save()
      .moveTo(LEFT, 754)
      .lineTo(LEFT + CONTENT_WIDTH, 754)
      .lineWidth(0.5)
      .strokeColor('#E2E8F0')
      .stroke()
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text('Confidential - Generated by RecruitAI Multi-Agent Recruiting Platform', LEFT, 762, {
        lineBreak: false,
      })
      .text(`Page ${index + 1} of ${range.count}`, LEFT, 762, {
        width: CONTENT_WIDTH,
        align: 'right',
        lineBreak: false,
      })
      .restore();

    doc.page.margins.bottom = pageBottom;
  }

  doc.end();
  return await completed;
}

/** Exported for tests that assert slug generation matches `routes_reports.py`. */
export function reportSlug(text: unknown): string {
  const cleaned = safePdfText(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_');
  return cleaned.replace(/^_+|_+$/g, '') || 'report';
}

export { formatMoney };
