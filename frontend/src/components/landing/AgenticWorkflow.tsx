'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const workflowStages = [
  {
    id: 'ingest',
    number: '01',
    name: 'Ingestion & Vectorization',
    agent: 'Intake Agent',
    badge: 'pgvector • Sub-second',
    summary: 'Instantly processes unstructured resumes and job requirements into structured schemas.',
    details: [
      'Extracts work history, tech stack, and project achievements from PDFs and DOCX files',
      'Generates 1536-dimension embeddings stored in Supabase pgvector',
      'Strict tenant isolation with Row-Level Security (RLS)',
    ],
    preview: {
      label: 'Vectorized Input Schema',
      code: `{\n  "skills_extracted": ["React", "TypeScript", "Node.js", "PostgreSQL"],\n  "experience_years": 6.5,\n  "vector_status": "embedded_pgvector",\n  "processing_time": "0.42s"\n}`,
    },
  },
  {
    id: 'supervisor',
    number: '02',
    name: 'Supervisor Orchestration',
    agent: 'LangGraph Supervisor',
    badge: 'LangGraph StateGraph',
    summary: 'The central supervisor agent classifies intent, builds the scoring rubric, and enforces blind mode.',
    details: [
      'Derives weighted evaluation criteria directly from the job description',
      'Applies demographic redaction rules (names, emails, universities, photos)',
      'Spawns parallel screening sub-agents with calibrated task payloads',
    ],
    preview: {
      label: 'Supervisor State Dispatch',
      code: `{\n  "active_route": "parallel_eval",\n  "blind_mode": true,\n  "rubric_weights": {\n    "tech_stack": 0.40,\n    "system_architecture": 0.35,\n    "problem_solving": 0.25\n  }\n}`,
    },
  },
  {
    id: 'scoring',
    number: '03',
    name: 'Parallel Rubric Evaluation',
    agent: 'Screening & Scoring Agents',
    badge: 'Multi-Agent Parallelism',
    summary: 'Specialized agents evaluate candidate evidence point-by-point against the role rubric.',
    details: [
      'Scores depth of experience against each required skill and system responsibility',
      'Identifies technical gaps to highlight for upcoming interview loops',
      'Computes composite match percentage and generates auditable evidence citations',
    ],
    preview: {
      label: 'Auditable Scorecard Result',
      code: `{\n  "candidate_ref": "CAN-4102",\n  "composite_match": 0.94,\n  "verdict": "Strong Fit",\n  "highlight": "6+ years production PostgreSQL performance tuning",\n  "gap": "Limited GraphQL experience (low impact)"\n}`,
    },
  },
  {
    id: 'action',
    number: '04',
    name: 'Human-Gated Action Dispatcher',
    agent: 'Action & Outreach Agent',
    badge: 'HITL Confirmation Gate',
    summary: 'Pre-drafts personalized outreach and interview questions, waiting for your final confirmation.',
    details: [
      'Synthesizes candidate background into custom, personalized outreach emails',
      'Generates targeted technical interview questions to test candidate gaps',
      'Strict guardrail: Zero automated sending without recruiter 1-click approval',
    ],
    preview: {
      label: 'Action Gate Status',
      code: `{\n  "action": "dispatch_interview_invite",\n  "recipient": "Candidate #4102",\n  "interview_slots": ["Thursday 2PM", "Friday 11AM"],\n  "status": "PAUSED_FOR_HUMAN_APPROVAL",\n  "awaiting_recruiter_confirm": true\n}`,
    },
  },
];

export default function AgenticWorkflow() {
  const [activeStage, setActiveStage] = useState(0);
  const current = workflowStages[activeStage];

  return (
    <section className="scroll-section py-20 md:py-32 px-8 bg-[#FAF9F7] border-y border-border">
      <div className="max-w-7xl mx-auto text-left">
        {/* Header */}
        <div className="max-w-3xl mb-14">
          <span className="text-[11px] font-semibold tracking-widest uppercase text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
            Autonomous Architecture
          </span>
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mt-4 mb-4">
            How RecruitAI evaluates candidates behind the scenes.
          </h2>
          <p className="text-muted text-lg leading-relaxed">
            A LangGraph multi-agent system coordinates specialized AI agents to extract requirements, score technical competence, and prepare outreach — with sub-second execution.
          </p>
        </div>

        {/* Pipeline Navigation Tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {workflowStages.map((stage, idx) => {
            const isActive = activeStage === idx;
            return (
              <button
                key={stage.id}
                onClick={() => setActiveStage(idx)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'bg-white border-accent shadow-sm ring-2 ring-accent/15'
                    : 'bg-white/60 hover:bg-white border-border/80 text-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-mono font-bold ${isActive ? 'text-accent' : 'text-muted'}`}>
                    STAGE {stage.number}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-accent animate-pulse' : 'bg-slate-300'}`} />
                </div>
                <div className={`text-sm font-bold truncate ${isActive ? 'text-foreground' : 'text-muted'}`}>
                  {stage.name}
                </div>
                <div className="text-xs text-muted mt-1 truncate">{stage.agent}</div>
              </button>
            );
          })}
        </div>

        {/* Active Stage Display Panel */}
        <div className="bg-white border border-border rounded-2xl p-6 md:p-10 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left: Stage Explanation */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs font-bold text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded">
                  STAGE {current.number}
                </span>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                  {current.badge}
                </span>
              </div>

              <div>
                <h3 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
                  {current.name}
                </h3>
                <p className="text-muted text-base mt-2 leading-relaxed">
                  {current.summary}
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div className="text-xs uppercase font-bold text-muted tracking-wider">
                  Key Capabilities:
                </div>
                <ul className="space-y-2.5">
                  {current.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-2.5 text-sm text-foreground/90">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        ✓
                      </span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Progress step controls */}
              <div className="pt-4 flex items-center gap-3">
                <button
                  onClick={() => setActiveStage((prev) => Math.max(0, prev - 1))}
                  disabled={activeStage === 0}
                  className="px-3.5 py-1.5 rounded-lg border border-border text-xs font-medium disabled:opacity-30 hover:bg-slate-50 transition-colors"
                >
                  ← Previous Stage
                </button>
                <button
                  onClick={() => setActiveStage((prev) => Math.min(workflowStages.length - 1, prev + 1))}
                  disabled={activeStage === workflowStages.length - 1}
                  className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-30 hover:bg-accent/90 transition-colors shadow-2xs"
                >
                  Next Stage →
                </button>
              </div>
            </div>

            {/* Right: Code / Execution Payload Preview */}
            <div className="lg:col-span-5">
              <div className="bg-[#111111] rounded-xl border border-neutral-800 shadow-xl overflow-hidden text-left">
                <div className="bg-[#1a1a1a] px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                  </div>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {current.preview.label}
                  </span>
                </div>
                <div className="p-5 font-mono text-xs text-neutral-200 leading-relaxed overflow-x-auto">
                  <AnimatePresence mode="wait">
                    <motion.pre
                      key={current.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.2 }}
                      className="text-[#a6e22e]"
                    >
                      {current.preview.code}
                    </motion.pre>
                  </AnimatePresence>
                </div>
                <div className="bg-[#161616] px-4 py-2 border-t border-neutral-800 text-[10px] text-neutral-400 font-mono flex items-center justify-between">
                  <span>State: Deterministic</span>
                  <span className="text-emerald-400 font-semibold">● LangGraph Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
