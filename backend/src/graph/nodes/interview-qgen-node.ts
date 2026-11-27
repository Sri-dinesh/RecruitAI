import type { Candidate } from '../../schemas/candidate.js';
import type { JobDescription } from '../../schemas/jd.js';
import { PiiSanitizer } from '../../services/redaction.js';
import { getGraphDeps, type GraphDeps } from '../deps.js';
import { resolveCandidateWithMemory } from '../router.js';
import { historyOf, resumesOf } from '../state.js';
import type { RecruitState } from '../state.js';

/**
 * Port of `backend/app/graph/nodes/interview_qgen_node.py`.
 *
 * Three modes: all candidates in the shortlist, JD/role-level questions, or one
 * candidate resolved through memory. Candidate questions are grounded in
 * retrieved resume chunks and PII-sanitized before the LLM call.
 */

export async function interviewQgenNode(
  state: RecruitState,
  deps: GraphDeps = getGraphDeps(),
): Promise<Partial<RecruitState>> {
  const history = historyOf(state);
  const jd = state.jd_structured ?? null;
  const resumes = resumesOf(state);
  const shortlist =
    state.last_shortlist && state.last_shortlist.length > 0 ? state.last_shortlist : resumes;
  const userMessage = history.length > 0 ? (history[history.length - 1]?.content ?? '') : '';
  const cleanedMessage = userMessage.toLowerCase().trim();

  // 1. Edge case: JD not loaded.
  if (!jd) {
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content:
            'I need a Job Description loaded first before I can generate interview prep questions. Please upload or paste a JD.',
        },
      ],
    };
  }

  // 2. Everyone / all candidates.
  const isAllCandidates =
    /\b(everyone|everybody|all candidates|all of them|all|both|entire list)\b/.test(cleanedMessage);

  if (isAllCandidates && resumes.length > 0) {
    const targetCandidates = shortlist.slice(0, 4);
    const sections: string[] = [];
    for (const candidate of targetCandidates) {
      const questions = await generateCandidateQuestions(candidate, jd, state, deps);
      sections.push(`### 👤 Interview Prep for **${candidate.name}**\n\n${questions}`);
    }

    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content:
            `## 📋 Interview Questions for Candidates (${jd.role})\n\n` +
            sections.join('\n\n---\n\n'),
        },
      ],
    };
  }

  // 3. JD/role-level questions.
  const isJdLevel =
    /\b(job description|jd|for the role|role|general|position)\b/.test(cleanedMessage) &&
    !resolveCandidateWithMemory(userMessage, state, 'interview_questions');

  if (isJdLevel) {
    const questions = await generateJdRoleQuestions(jd, deps);
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `### 📋 Role Interview Preparation: **${jd.role}**\n\n${questions}`,
        },
      ],
    };
  }

  // 4. Resolve a specific candidate (supervisor memory first for pronouns/follow-ups).
  const candidateId =
    state.active_candidate_id ||
    resolveCandidateWithMemory(userMessage, state, 'interview_questions');
  let candidate: Candidate | null;

  // If not resolved and resumes exist, accept the only candidate or ask.
  if (!candidateId) {
    if (resumes.length === 1) {
      candidate = resumes[0] ?? null;
    } else if (shortlist.length === 1) {
      candidate = shortlist[0] ?? null;
    } else {
      const names = shortlist.slice(0, 3).map((entry) => `**${entry.name}**`);
      return {
        conversation_history: [
          ...history,
          {
            role: 'assistant',
            content: `Which candidate would you like to generate interview questions for? (e.g. ${names.join(
              ', ',
            )}, 'the top candidate', or 'for everyone').`,
          },
        ],
      };
    }
  } else {
    // Find the candidate object in resumes or the shortlist.
    candidate =
      resumes.find((entry) => entry.candidate_id === candidateId) ??
      shortlist.find((entry) => entry.candidate_id === candidateId) ??
      null;
  }

  // Fallback to the top candidate or JD-level questions.
  if (!candidate) {
    if (resumes.length > 0) {
      candidate = resumes[0] ?? null;
    } else {
      const questions = await generateJdRoleQuestions(jd, deps);
      return {
        conversation_history: [
          ...history,
          {
            role: 'assistant',
            content: `### 📋 Role Interview Preparation: **${jd.role}**\n\n${questions}`,
          },
        ],
      };
    }
  }

  if (!candidate) {
    const questions = await generateJdRoleQuestions(jd, deps);
    return {
      conversation_history: [
        ...history,
        {
          role: 'assistant',
          content: `### 📋 Role Interview Preparation: **${jd.role}**\n\n${questions}`,
        },
      ],
    };
  }

  const questions = await generateCandidateQuestions(candidate, jd, state, deps);
  return {
    conversation_history: [
      ...history,
      {
        role: 'assistant',
        content: `### 👤 Interview Prep Questions for **${candidate.name}** (${jd.role})\n\n${questions}`,
      },
    ],
  };
}

async function generateCandidateQuestions(
  candidate: Candidate,
  jd: JobDescription,
  state: RecruitState,
  deps: GraphDeps,
): Promise<string> {
  let candidateText = '';
  try {
    const queryText = `Candidate skills and experience for role: ${jd.role}`;
    const queryEmbedding = await deps.embedText(queryText);
    const chunks = await deps.queryTopK({
      queryEmbedding,
      k: 3,
      candidateId: candidate.candidate_id,
      userId: state.user_id ?? null,
    });
    if (chunks.length > 0) {
      candidateText = chunks.map((chunk) => chunk.chunk_text ?? '').join('\n\n');
    }
  } catch {
    // Retrieval failure falls through to raw resume text.
  }

  if (!candidateText) {
    candidateText = candidate.raw_text || `Skills: ${(candidate.skills ?? []).join(', ')}`;
  }

  // AI-SEC-2: sanitize candidate context before LLM exposure.
  const sanitizer = new PiiSanitizer();
  const sanitizedText = sanitizer.sanitizeText(candidateText.slice(0, 3000), {
    candidateName: candidate.name,
    candidateId: candidate.candidate_id,
  });

  const systemInstruction =
    'You are an expert technical recruiter and interviewer. Generate 4-6 grounded interview questions for a candidate ' +
    'based on their resume details and the target job description. ' +
    'Provide a mix of technical proficiency, behavioral, and gap-probing questions. ' +
    'Output the questions in clean, professional markdown with numbered sections.';

  const gaps = candidate.gaps ?? [];
  const prompt =
    `Generate interview prep questions for candidate [CANDIDATE_${candidate.candidate_id}] applying for the role of '${jd.role}'.\n\n` +
    `Required Skills for Job: ${jd.required_skills.join(', ')}\n` +
    `Candidate's Identified Skill Gaps: ${gaps.length > 0 ? gaps.join(', ') : 'None identified'}\n\n` +
    'Candidate Resume Context:\n' +
    '<candidate_resume>\n' +
    `${sanitizedText}\n` +
    '</candidate_resume>\n\n' +
    'Interview Questions (Markdown):';

  try {
    const response = await deps.callLlm(prompt, { systemInstruction });
    return sanitizer.restoreText(response.text.trim());
  } catch {
    return generateLocalQuestions(candidate, jd);
  }
}

async function generateJdRoleQuestions(jd: JobDescription, deps: GraphDeps): Promise<string> {
  const skills =
    jd.required_skills.length > 0 ? jd.required_skills.join(', ') : 'Software Engineering';
  const responsibilities =
    jd.responsibilities && jd.responsibilities.length > 0
      ? jd.responsibilities.slice(0, 4).join('\n- ')
      : 'Core engineering tasks';

  const systemInstruction =
    'You are a technical hiring manager. Generate 5 core technical and architectural interview questions ' +
    'to evaluate candidates for this job description. Include evaluation criteria for each question.';
  const prompt =
    `Job Title: ${jd.role}\n` +
    `Required Experience: ${jd.experience_years}+ years\n` +
    `Key Skills: ${skills}\n` +
    `Key Responsibilities:\n- ${responsibilities}\n\n` +
    'Generate 5 structured interview questions in clean markdown.';

  try {
    const response = await deps.callLlm(prompt, { systemInstruction });
    return response.text.trim();
  } catch {
    return `#### 1. Core Technical Architecture
- Can you explain your experience with **${skills}** and how you have designed scalable systems in past projects?

#### 2. Hands-on Problem Solving
- How do you handle concurrency, distributed transactions, and data consistency in production?

#### 3. Operational Excellence & Reliability
- Describe your process for monitoring API latencies, debugging production issues, and writing robust tests.

#### 4. Team Leadership & Collaboration
- Tell us about a time you mentored junior engineers or made a major technical trade-off under tight deadlines.`;
  }
}

function generateLocalQuestions(candidate: Candidate, jd: JobDescription): string {
  const skills = (candidate.skills ?? []).slice(0, 5).join(', ') || 'general development';
  const gaps = candidate.gaps ?? [];

  const lines = [
    `These questions evaluate **${candidate.name}**'s experience with **${skills}** against the **${jd.role}** requirements.\n`,
  ];

  lines.push('#### 1. Technical Architecture & Core Proficiency');
  lines.push(
    `"Your background highlights experience with **${skills}**. Can you walk us through a recent project where you designed the core system architecture, explaining how you handled state management and database consistency?"\n`,
  );

  if (gaps.length > 0) {
    const gapText = gaps.slice(0, 2).join(', ');
    lines.push('#### 2. Skill Gap Exploration & Adaptability');
    lines.push(
      `"The role requires proficiency in **${gapText}**. Based on your experience in **${skills}**, how would you ramp up and apply these competencies in our environment?"\n`,
    );
  } else {
    lines.push('#### 2. Deep-Dive Technical Optimization');
    lines.push(
      `"How do you measure and optimize API response latencies and database query performance in production environments using **${skills}**?"\n`,
    );
  }

  lines.push('#### 3. System Design & Scalability');
  lines.push(
    '"Describe how you would design a high-throughput, concurrent backend API handling peak traffic spikes with zero-downtime guarantees."\n',
  );

  lines.push('#### 4. Behavioral & Engineering Mindset');
  lines.push(
    '"Tell us about a time you encountered a critical production bug or breaking API change close to a release deadline. How did you diagnose, resolve, and prevent future recurrences?"\n',
  );

  return lines.join('\n');
}
