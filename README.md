# RecruitAI

**RecruitAI** is a production‑grade, Multi-Agent recruitment chatbot built for the AI Bootcamp Hackathon. It lets a recruiter load job descriptions (JD) and dynamic resumes (PDF, DOCX, TXT), then interactively query the system to:

- Count the number of loaded candidates without LLM overhead.
- Screen and rank candidates against the JD using **Advanced RAG** (Query Expansion + LLM-assisted Chunks Reranking).
- Generate JDs, technical/behavioral interview questions, and live salary benchmarks.
- Finalise a short‑list with human‑in‑the‑loop confirmation.
- Generate and download styled corporate recruitment PDF reports and previews.

The system is built on **LangChain** and **LangGraph**, utilizing a **Multi-Agent Supervisor** delegation pattern.

---

## Table of Contents

1. [Overview & Agent Architecture](#overview--agent-architecture)
2. [Advanced RAG Pipeline](#advanced-rag-pipeline)
3. [Technical Stack](#technical-stack)
4. [Setup & Installation](#setup--installation)
5. [Running RecruitAI](#running-recruitai)
6. [Project Structure](#project-structure)
7. [Testing & Verification](#testing--verification)

---

## Overview & Agent Architecture

RecruitAI uses a state-of-the-art **Multi-Agent Supervisor** architecture implemented in LangGraph:

- **Supervisor Agent:** Acts as the entrance hub. It analyzes conversation history, classifies user intent, and delegates control to the correct specialized worker.
- **JD Agent:** Manages Job Description loading, parsing, and context rewriting.
- **RAG Screening Agent:** Handles semantic resume search (pgvector), candidate ranking, and plain candidate counting.
- **Interview & Salary Agent:** Generates custom technical/behavioral prep questions and queries market salary benchmarks.
- **Human-in-the-Loop Node:** Restricts candidate shortlist finalization behind explicit user yes/no confirmation.

---

## Advanced RAG Pipeline

Instead of a basic semantic vector query, RecruitAI implements an **Advanced RAG** pipeline:

1. **Query Expansion:** Expands the user's screening prompt with synonyms, alternative terms, and related skills using LLM translation to improve recall.
2. **Dense Retrieval:** Retrieves the top 5 chunks per candidate from Supabase pgvector using cosine similarity.
3. **LLM Reranking:** Evaluates retrieved chunks, scoring each 1-10 on relevance. Retains only the top 3 most relevant chunks to eliminate noise and save LLM token usage during candidate evaluations.

---

## Technical Stack

| Layer               | Technology                                   | Description                                   |
| ------------------- | -------------------------------------------- | --------------------------------------------- |
| Orchestration       | **LangGraph** (Python)                       | Multi-Agent state machines and transitions    |
| LLM Framework       | **LangChain** (`langchain-core`)             | Standardized models, messages, and runnables  |
| Model Integrations  | **Gemini** (`ChatGoogleGenerativeAI`) + **Groq** (`ChatGroq`) | Round-robin distribution with automatic failover |
| Document Parsing    | `pypdf` + `python-docx`                      | Dynamic PDF, DOCX, and TXT parsing            |
| Embeddings          | `sentence‑transformers` – `all‑MiniLM‑L6‑v2` | 384‑dim vector embedding generation           |
| Vector Store        | **Supabase** (Postgres + pgVector)           | Cosine similarity candidate vector database   |
| Web Search          | **Tavily**                                   | Lightweight salary search tool                |
| Report Generation   | **ReportLab**                                | Styled recruitment summary PDF compilation     |
| Config              | **python‑dotenv**                            | Environment variables in `.env`               |
| UI Frontend         | **Next.js 16** (App Router) + **Tailwind**   | Slate-themed dashboard, logs trace timeline   |

---

## Setup & Installation

1. **Create virtual environment** and install dependencies:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   pip install -r backend/requirements.txt
   ```
2. **Configure environment variables**:
   - Copy `backend/.env.example` to `backend/.env`.
   - Fill in the API keys for Gemini, Groq, Tavily, and Supabase.
   ```text
   GEMINI_API_KEY=your_gemini_key
   GROQ_API_KEY=your_groq_key
   TAVILY_API_KEY=your_tavily_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
3. **Initialize Supabase table**:
   - Run the DDL provided in `backend/scripts/init_db.sql` via psql or your Supabase SQL editor.

---

## Running RecruitAI

Run the interactive launcher:
```bash
python backend/run.py
```
Choose:
- `1` for the **FastAPI REST Server** (connects to the Next.js visual dashboard).
- `2` for the **CLI Terminal Chatbot** (interactive REPL).

### Running the Frontend
```bash
cd frontend
npm run dev
```
Open `http://localhost:3000` to interact with the dashboard: upload resumes, chat with the multi-agent system, trace classifications, and download styled reports.

---

## Project Structure

```
RecruitAI/
├─ backend/                     # Python backend (core logic)
│  ├─ app/                     # FastAPI style package
│  │  ├─ core/                 # config, logging, LLM router (LangChain wrappers)
│  │  ├─ graph/                # LangGraph state, Multi-Agent Supervisor nodes
│  │  ├─ rag/                  # chunking, embeddings, vector store, Advanced RAG
│  │  ├─ services/             # resume loader, report generator (ReportLab)
│  │  ├─ schemas/              # Pydantic models (JobDescription, Candidate)
│  │  ├─ tools/                # Tavily salary search tool
│  │  ├─ api/                  # HTTP endpoints (chat, reports, ingestion)
│  │  └─ cli.py                # REPL entry point
│  ├─ data/                    # Sample JD, resumes, salary fallback
│  ├─ tests/                   # pytest suite covering nodes, RAG, failovers
│  ├─ scripts/                 # DB init script
│  └─ requirements.txt         # Dependency list
├─ frontend/                    # Next.js 16 dashboard UI
│  ├─ src/                     # App router page and custom Markdown renderer
│  └─ package.json
├─ PLAN.md                    # blueprint
└─ README.md                  # **You are reading it**
```

---

## Testing & Verification

Run the comprehensive test suite covering all modules:
```bash
pytest
```
Includes:
- Schema validation (`tests/test_schemas.py`)
- Vector store ingestion (`tests/test_ingestion.py`)
- Graph nodes (`tests/test_nodes.py`)
- FastAPI endpoints (`tests/test_api.py`)
- PDF generation (`tests/test_reports.py`)
- File uploads (`tests/test_upload.py`)
- Query expansion & Reranking (`tests/test_advanced_rag.py`)
- LLM Round-Robin Failover (`tests/test_failover.py`)
