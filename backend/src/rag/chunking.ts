/**
 * Port of `backend/app/rag/chunking.py`.
 *
 * Context-aware chunking that splits resumes by paragraphs first, preserving
 * semantic sections, then enforces the 150-word window with a 25-word overlap.
 */

export interface ResumeChunk {
  readonly candidate_id: string;
  readonly candidate_name: string;
  readonly chunk_text: string;
}

export function chunkResume(
  text: string,
  candidateId: string,
  candidateName: string,
  chunkSizeWords = 150,
  overlapWords = 25,
): ResumeChunk[] {
  const paragraphs = text
    .split('\n\n')
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: ResumeChunk[] = [];
  let current: string[] = [];

  const push = (words: string[]): void => {
    chunks.push({
      candidate_id: candidateId,
      candidate_name: candidateName,
      chunk_text: words.join(' '),
    });
  };

  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.split(/\s+/).filter((word) => word.length > 0);

    if (current.length + paragraphWords.length > chunkSizeWords && current.length > 0) {
      push(current);
      current = overlapWords > 0 ? current.slice(-overlapWords) : [];
    }

    current.push(...paragraphWords);

    while (current.length > chunkSizeWords) {
      push(current.slice(0, chunkSizeWords));
      current = current.slice(chunkSizeWords - overlapWords);
    }
  }

  if (current.length > 0) {
    push(current);
  }

  return chunks;
}
