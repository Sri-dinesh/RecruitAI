/**
 * Shared Type Definitions for RecruitAI Mobile App
 */

export interface Candidate {
  candidate_id: string;
  name: string;
  raw_text?: string;
  match_score?: number | null;
  matched_skills?: string[] | null;
  gaps?: string[] | null;
  experience_years?: number | null;
  red_flags?: string[] | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  headline?: string | null;
  summary?: string | null;
  skills?: string[];
  work_experience?: string[];
  education?: string[];
  certifications?: string[];
  links?: string[];
  languages?: string[];
  // Local/Decision workflow state
  status?: "shortlisted" | "offered" | "rejected" | "new";
}

export interface JobDescription {
  role: string;
  required_skills: string[];
  experience_years: number;
  responsibilities?: string[];
  nice_to_have?: string[];
  raw_text?: string;
  location?: string;
  salary_range?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  metadata?: Record<string, any>;
}

export interface ScheduledInterview {
  candidate_name: string;
  slot: string;
  booked_at?: string;
}

export interface ChatSession {
  id: string;
  user_id?: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  job_id?: string;
  last_intent?: string;
  pending_confirmation?: string;
  jd_structured?: JobDescription | null;
  resumes?: Candidate[];
  last_shortlist?: Candidate[] | null;
  scheduled_interviews?: ScheduledInterview[];
  conversation_history?: ChatMessage[];
}

export interface CandidateEvaluation {
  candidate_id: string;
  user_id?: string;
  tech_score: number;
  comm_score: number;
  notes: string;
  updated_at?: string;
}

export interface ChatApiResponse {
  response: string;
  jd_structured?: JobDescription | null;
  resumes?: Candidate[];
  last_shortlist?: Candidate[] | null;
  pending_confirmation?: string | null;
  last_intent?: string | null;
  conversation_history: ChatMessage[];
  router_logs?: string[];
  scheduled_interviews?: ScheduledInterview[];
  session_id: string;
}
