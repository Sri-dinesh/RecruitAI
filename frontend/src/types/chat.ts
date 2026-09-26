/**
 * Strictly typed interfaces for RecruitAI Chat / Copilot interactions.
 * Aligned with backend Pydantic models (ChatRequest, ChatResponse).
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  agentSteps?: string[];
  suggestedFollowups?: string[];
  timestamp?: string;
}

export type Message = ChatMessage;

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequestPayload {
  message: string;
  conversation_history: ChatHistoryItem[];
  session_id: string;
  jd_structured?: Record<string, any>;
  client_timestamp?: string;
  focused_candidate_id?: string;
}

export interface ChatResponsePayload {
  response?: string;
  message?: string;
  session_id?: string;
  agent_steps?: string[];
  suggested_followups?: string[];
  execution_time_ms?: number;
  tokens_used?: number;
}
