import type { Candidate } from '../../schemas/candidate.js';
import { PiiSanitizer } from '../../services/redaction.js';
import { getGraphDeps, type GraphDeps } from '../deps.js';
import { resolveCandidateWithMemory } from '../router.js';
import { historyOf, resumesOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/candidate_qa_node.py`.
 *
 * Answers candidate-specific questions from metadata plus vector retrieval,
 * with PII minimization before the LLM call and token restoration afterwards.
 */

const QA_SYSTEM_INSTRUCTION =
  'You are an expert AI recruitment assistant answering a specific question about candidate(s). ' +
  'Answer the question directly, concisely, and professionally based on the provided candidate resume context. ' +
  'Use bullet points for lists like skills, projects, or work history when appropriate.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function candidateQaNode(
  state: RecruitState,
  deps: GraphDeps = getGraphDeps(),
): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const userQuery = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
  const resumes = resumesOf(state);
  const sanitizer = new PiiSanitizer();

  // 1. Identify the target candidate (supervisor memory first).
  let targetCandidate: Candidate | null = null;
  const queryLower = userQuery.toLowerCase();

  const memoryId =
    state.active_candidate_id || resolveCandidateWithMemory(userQuery, state, 'query_candidate');
  if (memoryId) {
    targetCandidate = resumes.find((candidate) => candidate.candidate_id === memoryId) ?? null;
  }

  if (!targetCandidate) {
    for (const candidate of resumes) {
      const nameParts = candidate.name.split(/\s+/).map((part) => part.toLowerCase());
      if (
        nameParts.some((part) => part.length > 2 && queryLower.includes(part)) ||
        (candidate.candidate_id && queryLower.includes(candidate.candidate_id.toLowerCase()))
      ) {
        targetCandidate = candidate;
        break;
      }
    }
  }

  // 2. Build candidate context.
  let contextText = '';
  const candidateName = targetCandidate?.name ?? 'the candidate';

  if (targetCandidate) {
    contextText += `Candidate Name: ${targetCandidate.name}\n`;
    if (targetCandidate.headline) {
      contextText += `Title/Headline: ${targetCandidate.headline}\n`;
    }
    if (targetCandidate.experience_years) {
      contextText += `Experience: ${targetCandidate.experience_years} years\n`;
    }
    if (targetCandidate.skills?.length) {
      contextText += `Extracted Skills: ${targetCandidate.skills.join(', ')}\n`;
    }
    if (targetCandidate.work_experience?.length) {
      contextText += `Work Experience: ${targetCandidate.work_experience.join('; ')}\n`;
    }
    if (targetCandidate.education?.length) {
      contextText += `Education: ${targetCandidate.education.join('; ')}\n`;
    }
    if (targetCandidate.links?.length) {
      contextText += `Links/Portfolio: ${targetCandidate.links.join(', ')}\n`;
    }
    if (targetCandidate.summary) {
      contextText += `Summary: ${targetCandidate.summary}\n`;
    }

    const rawSnippet = (targetCandidate.raw_text ?? '').slice(0, 3000);
    contextText += `\nFull Resume Text:\n${rawSnippet}\n`;
  } else if (resumes.length > 0) {
    contextText = 'Available Loaded Candidates:\n\n';
    for (const candidate of resumes.slice(0, 5)) {
      const rawSnippet = (candidate.raw_text ?? '').slice(0, 1000);
      contextText +=
        `--- Candidate: ${candidate.name} ---\n` +
        `Skills: ${(candidate.skills ?? []).slice(0, 10).join(', ')}\n` +
        `${rawSnippet}\n\n`;
    }
  } else {
    contextText = 'No candidate resumes are currently loaded in the active workspace context.';
  }

  // 3. Augment with vector retrieval (best effort).
  try {
    const embeddings = await deps.embedTexts([userQuery]);
    const queryEmbedding = embeddings[0];
    if (queryEmbedding) {
      const chunks = await deps.queryTopK({
        queryEmbedding,
        k: 3,
        candidateId: targetCandidate?.candidate_id ?? null,
        userId: state.user_id ?? null,
      });
      if (chunks.length > 0) {
        contextText += '\nVector Retrieval Snippets:\n';
        for (const chunk of chunks) {
          contextText += `- ${chunk.chunk_text ?? ''}\n`;
        }
      }
    }
  } catch {
    // Retrieval is an augmentation; metadata context remains sufficient.
  }

  // AI-SEC-2: sanitize context and question before LLM exposure.
  const sanitizedContext = sanitizer.sanitizeText(contextText, {
    candidateName: targetCandidate?.name ?? null,
    candidateId: targetCandidate?.candidate_id ?? null,
  });
  const sanitizedQuery = sanitizer.sanitizeText(userQuery, {
    candidateName: targetCandidate?.name ?? null,
    candidateId: targetCandidate?.candidate_id ?? null,
  });

  // 4. Synthesize the answer.
  const prompt =
    `User Question: "${sanitizedQuery}"\n\n` +
    `Candidate Resume Context:\n${sanitizedContext}\n\n` +
    'Answer:';

  let answer: string;
  try {
    const response = await deps.callLlm(prompt, { systemInstruction: QA_SYSTEM_INSTRUCTION });
    answer = sanitizer.restoreText(response.text.trim());
  } catch (error) {
    answer = `Failed to retrieve details for ${candidateName}: ${errorMessage(error)}`;
  }

  return {
    conversation_history: [...history, { role: 'assistant', content: answer }],
    last_intent: 'query_candidate',
    active_candidate_id: targetCandidate?.candidate_id ?? state.active_candidate_id ?? null,
  };
}
