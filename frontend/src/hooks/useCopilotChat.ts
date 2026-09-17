import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithAuth } from '@/lib/apiClient';
import { ChatMessage, ChatRequestPayload, ChatResponsePayload } from '@/types/chat';

interface UseCopilotChatOptions {
  activeSessionId?: string | null;
  jd?: Record<string, any> | null;
  initialMessages?: ChatMessage[];
  onSessionUpdated?: () => void;
}

export function useCopilotChat({
  activeSessionId,
  jd,
  initialMessages,
  onSessionUpdated
}: UseCopilotChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages || []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  // Reset or update messages if initialMessages changes and messages is empty
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  const toggleSteps = useCallback((idx: number) => {
    setExpandedSteps(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  }, []);

  const handleClearHistory = useCallback(() => {
    setMessages([
      {
        role: 'assistant',
        content: 'Session history reset. Ready for new recruitment queries.',
        agentSteps: ['Supervisor: Reset session memory']
      }
    ]);
  }, []);

  const handleExportChat = useCallback(() => {
    const text = messages
      .map(m => `### ${m.role === 'user' ? 'Recruiter' : 'RecruitAI Copilot'}\n\n${m.content}\n\n---\n`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recruitai-copilot-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const handleSend = useCallback(async (userPrompt?: string) => {
    const textToSend = (userPrompt || input).trim();
    if (!textToSend || isLoading) return;

    setInput('');
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: textToSend, timestamp: new Date().toISOString() }
    ];
    setMessages(newMessages);
    setIsLoading(true);
    setCurrentStep('Analyzing recruitment query with multi-agent supervisor...');

    try {
      // Strictly typed payload with standard 8-turn conversation memory window (ARCH-5)
      const payload: ChatRequestPayload = {
        message: textToSend,
        conversation_history: newMessages.slice(-8).map(m => ({
          role: m.role,
          content: m.content
        })),
        session_id: activeSessionId || 'default',
        client_timestamp: new Date().toISOString()
      };

      if (jd) {
        payload.jd_structured = jd;
      }

      const res = await fetchWithAuth('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Chat API responded with status ${res.status}`);
      }

      const data: ChatResponsePayload = await res.json();
      const responseContent = data.response || data.message || 'I have completed the analysis for you.';

      // Consume real agent steps from backend if provided; avoid fake simulated timers (ARCH-6)
      const realSteps = data.agent_steps && data.agent_steps.length > 0 
        ? data.agent_steps 
        : ['Supervisor: Synthesized agent response'];

      const followups = data.suggested_followups && data.suggested_followups.length > 0
        ? data.suggested_followups
        : [
            'Compare our top candidates side-by-side',
            'Generate a technical interview rubric for this role',
            'Draft interview invitation email for the top candidate'
          ];

      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: responseContent,
          agentSteps: realSteps,
          suggestedFollowups: followups.slice(0, 3),
          timestamp: new Date().toISOString()
        }
      ]);

      if (data.session_id && onSessionUpdated) {
        onSessionUpdated();
      }
    } catch (err: any) {
      console.error('[useCopilotChat] Error communicating with AI Copilot:', err);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `⚠️ **Error communicating with AI Copilot**: ${err.message || 'Network error'}. Please verify backend connectivity.`
        }
      ]);
    } finally {
      setIsLoading(false);
      setCurrentStep(null);
    }
  }, [input, isLoading, messages, activeSessionId, jd, onSessionUpdated]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    currentStep,
    copiedIdx,
    expandedSteps,
    toggleSteps,
    handleSend,
    handleCopy,
    handleClearHistory,
    handleExportChat
  };
}
