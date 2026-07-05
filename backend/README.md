# Backend (RecruitAI)

This directory contains the **Python backend** that powers the RecruitAI CLI chatbot. It implements the router‑first architecture, RAG‑based candidate screening, and supporting services.

---

## Table of Contents

1. [Project Layout](#project-layout)
2. [Key Components](#key-components)
3. [Setup & Installation](#setup--installation)
4. [Running the Application](#running-the-application)
5. [API (Stretch Goal)](#api-stretch-goal)
6. [Testing](#testing)
7. [Development Scripts](#development-scripts)

---

## Project Layout

```
backend/
├─ app/                     # Core package (mirrors a FastAPI layout)
│  ├─ core/                 # Configuration, logging, LLM router
│  ├─ graph/                # LangGraph state, builder, router node, individual intent nodes
│  ├─ rag/                  # Chunking, embedding generation, vector‑store wrapper
│  ├─ services/             # Resume ingestion, report generation, etc.
│  ├─ schemas/              # Pydantic models (JobDescription, Candidate)
│  ├─ tools/                # External tool wrappers (e.g., Tavily salary search)
│  ├─ api/                  # HTTP endpoints (future stretch goal)
│  └─ cli.py                # REPL entry point used by the hackathon demo
├─ data/                    # Sample JD files, synthetic resumes, salary fallback JSON
├─ tests/                   # pytest suite covering schemas, services, graph nodes
├─ scripts/                 # Database initialisation script (`init_db.sql`)
├─ requirements.txt         # Dependency list for the backend
└─ run.py                   # Optional script to launch the FastAPI server
```

---

## Key Components

- **`core/config.py`** – Loads environment variables via `python‑dotenv`.
- **`core/llm_router.py`** – Round‑robin provider selection (Gemini ↔ Groq) with fallback on rate‑limit errors.
- **`graph/router_node.py`** – Intent classification (rule‑based fast path + LLM fallback) and confidence handling.
- **`graph/nodes/`** – Individual intent handlers such as `count_node.py`, `screen_node.py`, `salary_node.py`, `hitl_confirm_node.py`.
- **`rag/`** – Chunking (`chunking.py`), embedding (`embeddings.py`), and vector‑store interaction (`vector_store.py`).
- **`services/resume_loader.py`** – Reads `.txt` resumes, returns `Candidate` objects.
- **`tools/tavily_search.py`** – Wrapper around the Tavily API for live salary queries.
- **`cli.py`** – Command‑line REPL that presents a Rich‑styled prompt and drives the graph.

---

## Setup & Installation

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows (use `source .venv/bin/activate` on *nix)
pip install -r requirements.txt
```

Create a `.env` file (copy from `.env.example`) and fill in the required keys:

```
GEMINI_API_KEY=...
GROQ_API_KEY=...
TAVILY_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Initialize the Supabase vector table (run once):

```bash
psql $SUPABASE_URL -c "$(cat scripts/init_db.sql)"
```

(Or execute the SQL via the Supabase dashboard.)

---

## Running the Application

### CLI (MVP)

```bash
python -m backend.app.cli
```

You will be dropped into a Rich REPL where you can type natural‑language commands such as:

- `load JD path/to/jd.txt and resumes/`
- `how many applicants?`
- `show top candidates`
- `salary for this role?`
- `finalize shortlist`

### FastAPI Server (stretch goal)

```bash
python -m backend.app.run
```

The server exposes the same graph logic over HTTP under `/api/*` endpoints (see `backend/app/api/` for definitions).

---

## API (Stretch Goal)

The `backend/app/api/` package contains FastAPI routers for:

- **Ingestion** – `/api/ingest/` to upload a JD and resumes.
- **Screening** – `/api/screen/` returns ranked candidates.
- **Interview Q&A** – `/api/interview/` generates questions.
- **Salary** – `/api/salary/` fetches live market data.
  These endpoints reuse the same LangGraph graph, making the API a thin wrapper around the CLI logic.

---

## Testing

Run the full test suite with:

```bash
cd backend
pytest
```

Key test modules:

- `tests/test_schemas.py` – Pydantic model validation.
- `tests/test_ingestion.py` – Resume loading and chunking.
- `tests/test_nodes.py` – Individual graph node behaviour.
- `tests/verify_router.py` – End‑to‑end intent routing correctness.

---

## Development Scripts

- **`scripts/init_db.sql`** – DDL for the `resume_chunks` table with pgVector index.
- **`backend/tests/create_synthetic_data.py`** – Generates the synthetic JD and resume files used for the demo.

---
