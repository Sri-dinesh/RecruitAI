import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import JSZip from 'jszip';

import { loadConfig } from '../src/config/index.js';
import {
  extractContactInfo,
  parseDocument,
  parseDocx,
  parseImage,
  parsePdf,
  parsePdfDetails,
} from '../src/services/document-parser.js';

/**
 * Minimal single-page PDF. pdf.js rebuilds the xref table when it is missing,
 * which keeps the fixture small and dependency-free.
 */
function makePdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  return Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n' +
      `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n` +
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n' +
      'trailer\n<< /Root 1 0 R /Size 6 >>\n%%EOF',
    'latin1',
  );
}

/** Single-page PDF whose page has no content stream, i.e. no extractable text. */
function makeScannedPdf(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
      'trailer\n<< /Root 1 0 R /Size 4 >>\n%%EOF',
    'latin1',
  );
}

async function makeDocx(documentXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ' +
      'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" ' +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
      'Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${documentXml}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

const NO_GEMINI = loadConfig({ GEMINI_API_KEY: '' });
const IMAGE_FALLBACK = 'Candidate Resume (Extracted from Mobile Photo Image)';

describe('extractContactInfo', () => {
  it('collects sorted, de-duplicated emails, phones and URLs', () => {
    const info = extractContactInfo(
      'Reach me at jane@example.com or john@example.com; call +1 555-123-4567 ' +
        'or (555) 987-6543. Portfolio: https://jane.dev and www.example.com',
    );

    assert.deepEqual(info.emails, ['jane@example.com', 'john@example.com']);
    assert.deepEqual(info.phones, ['(555) 987-6543', '+1 555-123-4567']);
    assert.deepEqual(info.urls, ['https://jane.dev', 'www.example.com']);
  });

  it('returns empty lists when no contact details exist', () => {
    assert.deepEqual(extractContactInfo('no contact details here'), {
      emails: [],
      phones: [],
      urls: [],
    });
  });
});

describe('parsePdf', () => {
  it('extracts text from PDF bytes', async () => {
    const text = await parsePdf(makePdf('Jane Doe Senior Engineer Python'));
    assert.equal(text, 'Jane Doe Senior Engineer Python');
  });

  it('extracts text from a PDF path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'recruitai-pdf-'));
    const path = join(dir, 'resume.pdf');
    try {
      await writeFile(path, makePdf('Path Based Resume'));
      assert.equal(await parsePdf(path), 'Path Based Resume');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects empty byte input with the Python message', async () => {
    await assert.rejects(() => parsePdf(Buffer.alloc(0)), {
      message: 'PDF content is empty (0 bytes).',
    });
  });

  it('reports a missing path verbatim', async () => {
    await assert.rejects(() => parsePdf('/definitely/not/here.pdf'), {
      message: 'File not found: /definitely/not/here.pdf',
    });
  });

  it('fails when the page has no extractable text', async () => {
    await assert.rejects(() => parsePdf(makeScannedPdf()), {
      message:
        'Could not extract readable text from PDF. It may contain scanned images without OCR text.',
    });
  });

  it('reports page count and contact info', async () => {
    const details = await parsePdfDetails(makePdf('Jane Doe jane@example.com +1 555-123-4567'));

    assert.equal(details.num_pages, 1);
    assert.equal(details.has_text, true);
    assert.equal(details.text, 'Jane Doe jane@example.com +1 555-123-4567');
    assert.deepEqual(details.contact_info.emails, ['jane@example.com']);
    assert.deepEqual(details.contact_info.phones, ['+1 555-123-4567']);
  });

  it('wraps detail failures with the Python prefix', async () => {
    await assert.rejects(() => parsePdfDetails(makeScannedPdf()), {
      message: /^Failed to parse PDF details: /,
    });
  });
});

describe('parseDocx', () => {
  it('extracts body paragraphs then table rows', async () => {
    const docx = await makeDocx(
      '<w:p><w:r><w:t>Jane Doe</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Senior</w:t></w:r><w:r><w:tab/><w:t>Engineer</w:t></w:r></w:p>' +
        '<w:tbl><w:tr>' +
        '<w:tc><w:p><w:r><w:t>Python</w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:p><w:r><w:t>Docker</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Kubernetes</w:t></w:r></w:p></w:tc>' +
        '</w:tr></w:tbl>',
    );

    assert.equal(await parseDocx(docx), 'Jane Doe\nSenior\tEngineer\nPython | Docker\nKubernetes');
  });

  it('decodes XML entities and line breaks', async () => {
    const docx = await makeDocx(
      '<w:p><w:r><w:t>R&amp;D</w:t></w:r><w:r><w:br/><w:t>Team</w:t></w:r></w:p>',
    );

    assert.equal(await parseDocx(docx), 'R&D\nTeam');
  });

  it('does not duplicate paragraphs nested inside table cells', async () => {
    const docx = await makeDocx(
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Python</w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:p><w:r><w:t>Docker</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    );

    assert.equal(await parseDocx(docx), 'Python | Docker');
  });

  it('rejects an archive without word/document.xml', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'not a docx');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await assert.rejects(() => parseDocx(buffer), {
      message: /^Failed to parse DOCX file: /,
    });
  });

  it('rejects empty byte input with the Python message', async () => {
    await assert.rejects(() => parseDocx(Buffer.alloc(0)), {
      message: 'DOCX content is empty (0 bytes).',
    });
  });
});

describe('parseImage', () => {
  it('returns the Python placeholder when Gemini is not configured', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(await parseImage(png, { config: NO_GEMINI }), IMAGE_FALLBACK);
  });

  it('uses the Gemini vision response when configured', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const prompts: string[] = [];

    const text = await parseImage(png, {
      config: loadConfig({ GEMINI_API_KEY: 'gemini-test-key' }),
      invoker: async (request) => {
        prompts.push(request.prompt);
        assert.equal(request.temperature, 0.1);
        assert.equal(request.image?.mimeType, 'image/jpeg');
        assert.ok(request.image?.data);
        return { content: 'Extracted resume text' };
      },
    });

    assert.equal(text, 'Extracted resume text');
    assert.equal(prompts.length, 1);
    assert.match(prompts[0] ?? '', /Extract all text/);
  });

  it('falls back to the placeholder when every model fails', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const text = await parseImage(png, {
      config: loadConfig({ GEMINI_API_KEY: 'gemini-test-key' }),
      invoker: async () => {
        throw new Error('vision unavailable');
      },
    });

    assert.equal(text, IMAGE_FALLBACK);
  });

  it('rejects empty image bytes', async () => {
    await assert.rejects(() => parseImage(Buffer.alloc(0)), {
      message: 'Image content is empty.',
    });
  });
});

describe('parseDocument', () => {
  it('dispatches by extension', async () => {
    const docx = await makeDocx('<w:p><w:r><w:t>Docx body</w:t></w:r></w:p>');

    assert.equal(await parseDocument(makePdf('PDF body'), 'resume.pdf'), 'PDF body');
    assert.equal(await parseDocument(docx, 'resume.docx'), 'Docx body');
    assert.equal(await parseDocument(Buffer.from('plain text'), 'notes.txt'), 'plain text');
  });

  it('sniffs magic bytes when the extension is unknown', async () => {
    assert.equal(await parseDocument(makePdf('Magic PDF'), 'file.bin'), 'Magic PDF');

    const docx = await makeDocx('<w:p><w:r><w:t>Magic DOCX</w:t></w:r></w:p>');
    assert.equal(await parseDocument(docx, 'file.bin'), 'Magic DOCX');

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(await parseDocument(png, 'file.bin', { config: NO_GEMINI }), IMAGE_FALLBACK);
  });

  it('strips control characters from plain-text fallbacks', async () => {
    const text = await parseDocument(Buffer.from('Hello\u0000World\u0007!'), 'file.bin');
    assert.equal(text, 'HelloWorld!');
  });

  it('dispatches by sniffed bytes for file paths without a useful extension', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'recruitai-doc-'));
    const path = join(dir, 'payload.bin');
    try {
      await writeFile(path, makePdf('Sniffed Path PDF'));
      assert.equal(await parseDocument(path), 'Sniffed Path PDF');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws for a path that does not exist', async () => {
    await assert.rejects(() => parseDocument('/definitely/not/here'), {
      message: 'Unsupported file source.',
    });
  });
});
