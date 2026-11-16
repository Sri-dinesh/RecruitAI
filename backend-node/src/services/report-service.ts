import type { AppConfig } from '../config/index.js';
import {
  createWorkspaceQueryStore,
  type DbRow,
  type WorkspaceQueryStore,
} from '../db/workspace-query-store.js';
import type { ReportRequest } from '../schemas/reports.js';
import { generateRecruitmentReport, reportSlug } from './report-generator.js';
import { asJsonObject } from './session-service.js';
import { HttpError } from '../types/errors.js';

/** Port of the session-linked part of `backend/app/api/routes_reports.py`. */

export interface ReportServiceOptions {
  readonly config?: AppConfig;
  readonly queryStore?: WorkspaceQueryStore;
}

export interface GeneratedReport {
  readonly buffer: Buffer;
  readonly filename: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function metadataOf(row: DbRow): Record<string, unknown> {
  return asJsonObject(row['metadata']);
}

export class ReportService {
  private readonly config: AppConfig | undefined;
  private store: WorkspaceQueryStore | undefined;

  constructor(options: ReportServiceOptions = {}) {
    this.config = options.config;
    this.store = options.queryStore;
  }

  private getStore(): WorkspaceQueryStore {
    this.store ??= createWorkspaceQueryStore(
      this.config === undefined ? {} : { config: this.config },
    );
    return this.store;
  }

  /** `POST /api/reports/generate` — caller supplies the whole payload. */
  async generateDirect(request: ReportRequest): Promise<GeneratedReport> {
    const buffer = await generateRecruitmentReport({
      jd: request.jd,
      shortlist: request.shortlist,
      interviewQuestions: request.interview_questions,
      salaryData: request.salary_data,
      candidates: request.candidates,
      evaluations: request.evaluations,
      scheduledInterviews: request.scheduled_interviews,
      isBlindMode: request.is_blind_mode === true,
      sessionTitle: request.session_title ?? null,
      recruiterName: request.recruiter_name ?? null,
    });
    return { buffer, filename: 'recruitment_report.pdf' };
  }

  /** `GET /api/reports/session/:id` — assemble the dossier from the workspace. */
  async generateForSession(
    userId: string,
    sessionId: string,
    blindMode: boolean | null,
  ): Promise<GeneratedReport> {
    try {
      const store = this.getStore();
      const session = await store.getSession(userId, sessionId);
      if (!session) {
        throw new HttpError(404, 'Campaign session not found.');
      }
      const jobId = session['job_id'];
      const sessionTitle = session['title'];

      let recruiterName = 'Lead Recruiter';
      let isBlindMode = false;
      try {
        const user = await store.getUser(userId);
        if (user) {
          recruiterName = (user['full_name'] as string | null) ?? 'Lead Recruiter';
          const prefs = asJsonObject(user['preferences']);
          if (blindMode !== null) {
            isBlindMode = blindMode;
          } else {
            isBlindMode = prefs['blind_mode_default'] === true;
          }
        }
      } catch {
        // Python swallows recruiter-profile failures and keeps the defaults.
      }

      let jdData: Record<string, unknown> = {};
      if (typeof jobId === 'string' && jobId) {
        const job = await store.getJobStructured(userId, jobId);
        if (job && job['jd_structured']) {
          jdData = asJsonObject(job['jd_structured']);
        }
      }

      const sessionCandidateIds = new Set(await store.listSessionCandidates(sessionId));
      const candidates = await store.listCandidates(userId);
      const applications = await store.listApplications(userId);
      const appsMap = new Map<string, DbRow>();
      for (const application of applications) {
        const candidateId = application['candidate_id'];
        if (typeof candidateId !== 'string') {
          continue;
        }
        if (typeof jobId === 'string' && jobId && application['job_id'] !== jobId) {
          continue;
        }
        appsMap.set(candidateId, application);
      }

      // Python reads a `candidate_evaluations` table that does not exist in the
      // migrated schema; rubric data lives on `applications.match_reasoning`.
      const evaluationsMap: Record<string, unknown> = {};
      for (const application of applications) {
        const candidateId = application['candidate_id'];
        if (typeof candidateId !== 'string') {
          continue;
        }
        const rubric = asJsonObject(application['match_reasoning'])['rubric'];
        if (rubric && typeof rubric === 'object' && !Array.isArray(rubric)) {
          evaluationsMap[candidateId] = rubric;
        }
      }

      const candidatesList: DbRow[] = [];
      const shortlistData: DbRow[] = [];
      for (const candidate of candidates) {
        const candidateId = candidate['id'];
        if (typeof candidateId !== 'string') {
          continue;
        }
        const metadata = metadataOf(candidate);
        const sessionIds = Array.isArray(metadata['session_ids']) ? metadata['session_ids'] : [];
        const belongs =
          sessionCandidateIds.has(candidateId) ||
          appsMap.has(candidateId) ||
          metadata['session_id'] === sessionId ||
          sessionIds.includes(sessionId);
        if (!belongs && sessionCandidateIds.size > 0) {
          continue;
        }

        const application = appsMap.get(candidateId) ?? {};
        const reasoning = asJsonObject(application['match_reasoning']);
        const matchedSkills =
          (Array.isArray(reasoning['matched_skills']) && reasoning['matched_skills'].length > 0
            ? reasoning['matched_skills']
            : metadata['skills']) ?? [];
        const gaps = reasoning['gaps'] ?? [];
        const score =
          application['match_score'] !== null && application['match_score'] !== undefined
            ? application['match_score']
            : (metadata['match_score'] ?? 0);
        const status = application['status'] ?? metadata['status'] ?? 'new';

        const entry: DbRow = {
          candidate_id: candidateId,
          name: candidate['full_name'],
          email: candidate['email'] ?? null,
          phone: candidate['phone'] ?? null,
          match_score: score,
          status,
          matched_skills: matchedSkills,
          gaps,
          experience_years: metadata['experience_years'] ?? 0,
          summary: reasoning['summary'] ?? '',
        };
        candidatesList.push(entry);
        if (['shortlisted', 'offered'].includes(String(status))) {
          shortlistData.push(entry);
        }
      }

      const candidateIds = candidatesList
        .map((candidate) => candidate['candidate_id'])
        .filter((id): id is string => typeof id === 'string');
      const interviewRows = await store.listInterviews(userId, candidateIds);
      const nameById = new Map<string, string>();
      for (const candidate of candidates) {
        if (typeof candidate['id'] === 'string' && typeof candidate['full_name'] === 'string') {
          nameById.set(candidate['id'], candidate['full_name']);
        }
      }
      const scheduledInterviews = interviewRows.map((interview) => {
        const feedback = asJsonObject(interview['feedback']);
        const candidateId = interview['candidate_id'];
        const candidateName =
          (typeof candidateId === 'string' ? nameById.get(candidateId) : undefined) ??
          (typeof feedback['candidate_name'] === 'string'
            ? feedback['candidate_name']
            : undefined) ??
          'Candidate';
        return {
          candidate_name: candidateName,
          slot: String(interview['scheduled_at'] ?? 'TBD'),
          booked_at: String(feedback['booked_at'] ?? interview['scheduled_at'] ?? 'Confirmed'),
          mode: interview['mode'] ?? 'video',
          meeting_link: interview['meeting_link'] ?? null,
          status: interview['status'] ?? 'scheduled',
        };
      });

      const messages = await store.listChatMessages(userId, sessionId, {
        descending: true,
        limit: 15,
      });
      let questions = '';
      let salary = '';
      for (const message of messages) {
        const content = typeof message['content'] === 'string' ? message['content'] : '';
        const lower = content.toLowerCase();
        if (
          !questions &&
          ['interview question', 'prep question', 'technical question'].some((term) =>
            lower.includes(term),
          )
        ) {
          questions = content;
        }
        if (
          !salary &&
          ['salary', 'compensation', 'benchmark'].some((term) => lower.includes(term))
        ) {
          salary = content;
        }
      }

      const buffer = await generateRecruitmentReport({
        jd: jdData,
        shortlist: shortlistData,
        interviewQuestions: questions,
        salaryData: salary,
        candidates: candidatesList,
        evaluations: evaluationsMap,
        scheduledInterviews,
        isBlindMode,
        sessionTitle: typeof sessionTitle === 'string' ? sessionTitle : null,
        recruiterName,
      });

      const role = typeof jdData['role'] === 'string' ? jdData['role'] : null;
      const slug = reportSlug(role ?? sessionTitle ?? 'recruitment_report');
      return { buffer, filename: `${slug}_${sessionId.slice(0, 8)}.pdf` };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(500, `Failed to generate report: ${errorMessage(error)}`);
    }
  }
}

export function createReportService(options: ReportServiceOptions = {}): ReportService {
  return new ReportService(options);
}
