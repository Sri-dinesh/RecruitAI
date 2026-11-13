import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';

import JSZip from 'jszip';
import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

import { getConfig, type AppConfig } from '../config/index.js';
import { invokeGemini, type GeminiInvoker } from '../llm/gemini.js';
import { getNextModelOrder, extractText } from '../llm/router.js';
import { createLogger } from '../telemetry/logger.js';
import { cleanControlChars } from './parsing-utils.js';

/**
 * Port of `backend/app/services/document_parser.py`.
 *
 * PDF text comes from pdf.js (the Node equivalent of `pypdf`), DOCX text is
 * read from `word/document.xml` through JSZip (matching `python-docx`'s
 * paragraph + table ordering), and images use the Gemini vision path.
 */

const logger = createLogger('recruitai.document_parser');

export type DocumentInput = Buffer | string;

export interface ContactInfo {
  readonly emails: string[];
  readonly phones: string[];
  readonly urls: string[];
}

export interface PdfDetails {
  readonly text: string;
  readonly num_pages: number;
  readonly contact_info: ContactInfo;
  readonly has_text: boolean;
}

export interface ImageParseOptions {
  readonly config?: AppConfig;
  readonly invoker?: GeminiInvoker;
}

const IMAGE_PROMPT =
  'Extract all text, candidate qualifications, skills, contact info, and experience from this resume or job document accurately verbatim.';

const IMAGE_FALLBACK = 'Candidate Resume (Extracted from Mobile Photo Image)';

let cachedStandardFontsUrl: string | undefined;

/** pdf.js warns without standard font data; resolve it from the package once. */
function standardFontsUrl(): string | undefined {
  if (cachedStandardFontsUrl === undefined) {
    try {
      const require = createRequire(import.meta.url);
      const packageJson = require.resolve('pdfjs-dist/package.json');
      cachedStandardFontsUrl = `${join(dirname(packageJson), 'standard_fonts')}/`;
    } catch {
      cachedStandardFontsUrl = '';
    }
  }
  return cachedStandardFontsUrl || undefined;
}

async function readBytes(input: DocumentInput, kind: 'PDF' | 'DOCX'): Promise<Uint8Array> {
  if (typeof input === 'string') {
    let data: Buffer;
    try {
      data = await readFile(input);
    } catch {
      throw new Error(`File not found: ${input}`);
    }
    // Python only guards the in-memory path; an empty file fails inside the
    // parser and is wrapped as "Failed to parse ... file: ...".
    return new Uint8Array(data);
  }

  if (input.length === 0) {
    throw new Error(`${kind} content is empty (0 bytes).`);
  }
  return new Uint8Array(input);
}

function isPasswordError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'PasswordException' || /password/i.test(error.message))
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface OpenedPdf {
  readonly doc: PDFDocumentProxy;
  readonly task: PDFDocumentLoadingTask;
}

/**
 * Open a PDF from bytes.
 *
 * pdf.js exposes teardown on the loading task rather than the document proxy,
 * so both are returned to keep `parsePdf` / `parsePdfDetails` leak-free.
 */
async function openPdf(fileInput: DocumentInput): Promise<OpenedPdf> {
  const data = await readBytes(fileInput, 'PDF');
  try {
    const task = getDocument({
      data,
      password: '',
      verbosity: 0,
      useSystemFonts: false,
      ...(standardFontsUrl() ? { standardFontDataUrl: standardFontsUrl() } : {}),
    });
    const doc = await task.promise;
    return { doc, task };
  } catch (error) {
    if (isPasswordError(error)) {
      throw new Error('PDF is encrypted/password-protected and cannot be read.', {
        cause: error,
      });
    }
    throw error;
  }
}

/** Extract emails, phone numbers and URLs, sorted and de-duplicated. */
export function extractContactInfo(text: string): ContactInfo {
  const emails = [
    ...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []),
  ].sort();
  const phones = [
    ...new Set(text.match(/(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) ?? []),
  ].sort();
  const urls = [...new Set(text.match(/https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/g) ?? [])].sort();

  return { emails, phones, urls };
}

export async function parsePdf(fileInput: DocumentInput): Promise<string> {
  let opened: OpenedPdf | undefined;
  try {
    opened = await openPdf(fileInput);
    const { doc } = opened;

    const textPages: string[] = [];
    for (let index = 1; index <= doc.numPages; index += 1) {
      let pageText = '';
      try {
        const page = await doc.getPage(index);
        const content = await page.getTextContent();
        pageText = content.items
          .map((item) => {
            if (!('str' in item)) {
              return '';
            }
            return item.str + (item.hasEOL ? '\n' : '');
          })
          .join('');
        page.cleanup();
      } catch {
        pageText = '';
      }

      if (pageText.trim()) {
        textPages.push(cleanControlChars(pageText).trim());
      }
    }

    const extracted = textPages.join('\n\n').trim();
    if (!extracted) {
      throw new Error(
        'Could not extract readable text from PDF. It may contain scanned images without OCR text.',
      );
    }
    return extracted;
  } catch (error) {
    if (error instanceof Error && isKnownValueError(error.message)) {
      throw error;
    }
    throw new Error(`Failed to parse PDF file: ${errorMessage(error)}`, { cause: error });
  } finally {
    await opened?.task.destroy();
  }
}

/** Messages Python raises directly as `ValueError` (never re-wrapped). */
function isKnownValueError(message: string): boolean {
  return (
    message.startsWith('File not found:') ||
    message === 'PDF content is empty (0 bytes).' ||
    message === 'PDF is encrypted/password-protected and cannot be read.' ||
    message ===
      'Could not extract readable text from PDF. It may contain scanned images without OCR text.'
  );
}

export async function parsePdfDetails(fileInput: DocumentInput): Promise<PdfDetails> {
  try {
    // Python counts pages before extracting so a text failure still reports the
    // wrapper error message.
    const opened = await openPdf(fileInput);
    const numPages = opened.doc.numPages;
    await opened.task.destroy();

    const text = await parsePdf(fileInput);
    return {
      text,
      num_pages: numPages,
      contact_info: extractContactInfo(text),
      has_text: text.length > 0,
    };
  } catch (error) {
    throw new Error(`Failed to parse PDF details: ${errorMessage(error)}`, { cause: error });
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Text of one `<w:p>` block, including tabs and line breaks. */
function xmlBlockText(block: string): string {
  // Text, tabs and breaks are collected in document order. Extracting only
  // `<w:t>` bodies would drop the separators that sit between runs.
  const tokenPattern = /<w:(tab|br|cr)\b[^>]*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let text = '';
  for (const match of block.matchAll(tokenPattern)) {
    const kind = match[1];
    if (kind === 'tab') {
      text += '\t';
    } else if (kind === 'br' || kind === 'cr') {
      text += '\n';
    } else {
      text += decodeXmlEntities(match[2] ?? '');
    }
  }
  return text;
}

/**
 * Index just past the closing tag of the element opening at `start`.
 *
 * WordprocessingML nests paragraphs inside table cells and tables inside cells,
 * so a non-greedy regex cannot tell a body paragraph from a cell paragraph.
 */
function findElementEnd(xml: string, start: number, tag: string): number {
  const open = new RegExp(`<w:${tag}\\b[^>]*>`, 'g');
  const close = new RegExp(`</w:${tag}\\s*>`, 'g');
  open.lastIndex = start;
  close.lastIndex = start;

  let depth = 0;
  let cursor = start;
  while (cursor < xml.length) {
    const nextOpen = open.exec(xml);
    const nextClose = close.exec(xml);
    const openIndex = nextOpen?.index ?? Number.POSITIVE_INFINITY;
    const closeIndex = nextClose?.index ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(Math.min(openIndex, closeIndex))) {
      return xml.length;
    }

    if (openIndex < closeIndex) {
      const selfClosing = xml.slice(openIndex, open.lastIndex).endsWith('/>');
      if (!selfClosing) {
        depth += 1;
      }
      cursor = open.lastIndex;
      close.lastIndex = cursor;
      if (selfClosing && depth === 0) {
        return cursor;
      }
    } else {
      depth -= 1;
      cursor = close.lastIndex;
      if (depth === 0) {
        return cursor;
      }
      open.lastIndex = cursor;
    }
  }
  return xml.length;
}

interface DocxElement {
  readonly tag: 'p' | 'tbl';
  readonly xml: string;
}

/** Direct `<w:p>` / `<w:tbl>` children of `<w:body>`, in document order. */
function topLevelBodyElements(xml: string): DocxElement[] {
  const bodyStart = xml.indexOf('<w:body');
  if (bodyStart < 0) {
    return [];
  }
  const body = xml.slice(bodyStart);
  const elements: DocxElement[] = [];
  const opener = /<w:(p|tbl)\b[^>]*>/g;
  let cursor = 0;

  while (cursor < body.length) {
    opener.lastIndex = cursor;
    const match = opener.exec(body);
    if (!match) {
      break;
    }
    const start = match.index;
    const tag = match[1] as 'p' | 'tbl';
    const end = findElementEnd(body, start, tag);
    elements.push({ tag, xml: body.slice(start, end) });
    cursor = end;
  }

  return elements;
}

/** python-docx `Cell.text`: paragraphs joined by newlines, trimmed by caller. */
function docxCellText(cellXml: string): string {
  const paragraphs: string[] = [];
  const opener = /<w:p\b[^>]*>/g;
  let cursor = 0;
  while (cursor < cellXml.length) {
    opener.lastIndex = cursor;
    const match = opener.exec(cellXml);
    if (!match) {
      break;
    }
    const end = findElementEnd(cellXml, match.index, 'p');
    paragraphs.push(xmlBlockText(cellXml.slice(match.index, end)));
    cursor = end;
  }
  return paragraphs.join('\n');
}

/** Paragraphs first, then one row per table line (`cell | cell`), as in Python. */
function docxTextFromXml(xml: string): string {
  const lines: string[] = [];

  for (const element of topLevelBodyElements(xml)) {
    if (element.tag === 'p') {
      const text = xmlBlockText(element.xml);
      if (text) {
        lines.push(text);
      }
      continue;
    }

    for (const row of element.xml.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)) {
      const cells: string[] = [];
      for (const cell of (row[0] ?? '').matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)) {
        const text = docxCellText(cell[0] ?? '').trim();
        if (text) {
          cells.push(text);
        }
      }
      const rowText = cells.join(' | ');
      if (rowText) {
        lines.push(rowText);
      }
    }
  }

  return lines.join('\n').trim();
}

export async function parseDocx(fileInput: DocumentInput): Promise<string> {
  try {
    const data = await readBytes(fileInput, 'DOCX');
    const zip = await JSZip.loadAsync(data);
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) {
      throw new Error('word/document.xml is missing from the DOCX archive.');
    }

    const xml = await documentXml.async('string');
    return cleanControlChars(docxTextFromXml(xml));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('File not found:')) {
      throw error;
    }
    if (error instanceof Error && error.message === 'DOCX content is empty (0 bytes).') {
      throw error;
    }
    throw new Error(`Failed to parse DOCX file: ${errorMessage(error)}`, { cause: error });
  }
}

async function readImageBytes(fileInput: DocumentInput): Promise<Buffer> {
  if (typeof fileInput === 'string') {
    try {
      return await readFile(fileInput);
    } catch (error) {
      throw new Error(`Failed to read image: ${errorMessage(error)}`, { cause: error });
    }
  }
  return fileInput;
}

/**
 * Multimodal extraction via Gemini. Without a configured key the Python
 * backend returns a stable placeholder so ingestion still succeeds.
 */
export async function parseImage(
  fileInput: DocumentInput,
  options: ImageParseOptions = {},
): Promise<string> {
  const imageBytes = await readImageBytes(fileInput);
  if (imageBytes.length === 0) {
    throw new Error('Image content is empty.');
  }

  const config = options.config ?? getConfig();
  const apiKey = config.llm.geminiApiKey;
  if (apiKey && !apiKey.includes('your_gemini')) {
    const invoker = options.invoker ?? invokeGemini;
    const data = imageBytes.toString('base64');

    for (const model of getNextModelOrder()) {
      try {
        const response = await invoker({
          model,
          prompt: IMAGE_PROMPT,
          apiKey,
          temperature: 0.1,
          image: { mimeType: 'image/jpeg', data },
        });
        const text = extractText(response.content).trim();
        if (text) {
          return text;
        }
      } catch (error) {
        logger.warn(
          `[document_parser] Vision extraction (${model}) error: ${errorMessage(error)}`,
          {
            model,
            status: 'failed',
          },
        );
      }
    }
  }

  return IMAGE_FALLBACK;
}

/** Unified entry point for `.pdf`, `.docx`/`.doc`, `.txt`, `.png`, `.jpg`, `.jpeg`. */
export async function parseDocument(
  fileInput: DocumentInput,
  filename = '',
  options: ImageParseOptions = {},
): Promise<string> {
  let ext = '';
  if (filename) {
    ext = extname(filename).toLowerCase();
  } else if (typeof fileInput === 'string') {
    ext = extname(fileInput).toLowerCase();
  }

  if (ext === '.pdf') {
    return parsePdf(fileInput);
  }
  if (ext === '.docx' || ext === '.doc') {
    return parseDocx(fileInput);
  }
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    return parseImage(fileInput, options);
  }

  if (typeof fileInput !== 'string') {
    if (isPdfBytes(fileInput)) {
      return parsePdf(fileInput);
    }
    if (isZipBytes(fileInput)) {
      return parseDocx(fileInput);
    }
    if (isPngBytes(fileInput) || isJpegBytes(fileInput)) {
      return parseImage(fileInput, options);
    }

    try {
      const text = fileInput
        .toString('utf8')
        .replace(/\uFFFD/g, '')
        .trim();
      return cleanControlChars(text);
    } catch (error) {
      throw new Error(`Unable to extract text from document: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  try {
    const handle = await readFile(fileInput);
    const header = handle.subarray(0, 8);
    if (isPdfBytes(header)) {
      return parsePdf(fileInput);
    }
    if (isZipBytes(header)) {
      return parseDocx(fileInput);
    }
    if (isPngBytes(header) || isJpegBytes(header)) {
      return parseImage(fileInput, options);
    }

    const text = handle
      .toString('utf8')
      .replace(/\uFFFD/g, '')
      .trim();
    return cleanControlChars(text);
  } catch {
    // Missing paths fall through to the Python "Unsupported file source." error.
  }

  throw new Error('Unsupported file source.');
}

function isPdfBytes(value: Uint8Array): boolean {
  return value.length >= 4 && Buffer.from(value.subarray(0, 4)).toString('latin1') === '%PDF';
}

function isZipBytes(value: Uint8Array): boolean {
  return (
    value.length >= 4 &&
    value[0] === 0x50 &&
    value[1] === 0x4b &&
    value[2] === 0x03 &&
    value[3] === 0x04
  );
}

function isPngBytes(value: Uint8Array): boolean {
  return (
    value.length >= 4 &&
    value[0] === 0x89 &&
    value[1] === 0x50 &&
    value[2] === 0x4e &&
    value[3] === 0x47
  );
}

function isJpegBytes(value: Uint8Array): boolean {
  return value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff;
}
