# RecruitAI — Resume Description

## Resume Version
- Built RecruitAI, a production-grade multi-agent candidate intelligence platform using FastAPI, LangGraph, and Next.js 16, automating blind resume screening, JD parsing, and candidate shortlisting with LangChain-orchestrated LLM workflows.
- Implemented a Supervisor-Worker agent architecture in LangGraph with intent routing, conversational context tracking, and a fallback node, delegating tasks to specialized sub-agents for screening, JD rewriting, interview question generation, salary benchmarking, and scheduling.
- Engineered an advanced RAG pipeline with LLM-based query expansion and batched relevance reranking over a Supabase pgvector store, delivering semantic candidate matching and match-score grading against role-specific rubrics.
- Designed a high-availability LLM router with sticky round-robin failover between Gemini and Groq, JSON-mode output, and Pydantic schema validation, ensuring deterministic, typed responses across multi-agent calls.
- Developed a Next.js 16 dashboard with Tailwind, GSAP, and Framer Motion featuring PII-masked Blind Mode, a side-by-side comparison matrix, ATS-compliant CSV/JSON exports, PDF recruitment reports, and Human-in-the-Loop confirmation gates for outbound actions.

## One-Line Version
Built RecruitAI, a multi-agent LLM platform with FastAPI, LangGraph, and Next.js that automates blind resume screening, RAG-based candidate matching, and structured ATS exports for end-to-end recruiting workflows.

## ATS Keywords
- FastAPI
- Next.js
- React
- TypeScript
- Tailwind CSS
- LangGraph
- LangChain
- Multi-Agent Systems
- Retrieval-Augmented Generation (RAG)
- Vector Database
- pgvector
- Supabase
- PostgreSQL
- Pydantic
- Human-in-the-Loop (HITL)
- AI / LLM Orchestration
