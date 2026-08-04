# RecruitAI

![RecruitAI Co-Pilot Dashboard](RecruitAI-Co-Pilot-Dashboard.png)

PPT: https://canva.link/vhjbsmm3ggyqaf6  
Video Demo: https://drive.google.com/drive/folders/1LqA2B1YfSbc-91-OUlOwBDksLj5RAYDc?usp=sharing

RecruitAI is a production-grade, Multi-Agent candidate intelligence platform. Designed with a premium frontend and a rigorous backend, it automates technical evaluations, seamlessly parses resumes, and enforces blind screening with uncompromising accuracy.

## Architecture & Technology Stack

The platform is engineered for scale and determinism, leveraging state-of-the-art agentic frameworks paired with robust vector stores.

- **Frontend**: Next.js 16 (App Router), Tailwind CSS (Premium minimalist aesthetic), GSAP & Framer Motion.
- **Backend**: FastAPI, Python async backend.
- **Orchestration**: LangGraph and LangChain for multi-agent workflow management.
- **Vector Database**: Supabase (PostgreSQL with pgvector) for candidate semantic search.

## Key Features

- **Unbiased Screening (Blind Mode)**: Automatically strip names, contact information, and demographic indicators from resumes before evaluation to focus purely on the signal.
- **Deterministic JSON Outputs**: Multi-agent architecture forces structured ATS-ready JSON outputs for direct integration into existing systems.
- **Side-by-Side Evaluation Matrix**: Compare candidates systematically using custom, role-specific grading rubrics that score resumes point-by-point.
- **Automated Outreach & Scheduling**: Generate highly personalized candidate engagement emails that dynamically adjust tone, and secure interview slots instantly.
- **Advanced RAG Pipeline**: Utilizes query expansion, dense retrieval (pgvector), and LLM chunk reranking for precise candidate matching.

## Multi-Agent Workflow & Reliability

RecruitAI achieves production-level reliability by utilizing a Supervisor-Worker agent architecture rather than relying on a single monolith prompt. This ensures deterministic execution and strict state management.

- **Routing & Orchestration**: A central Supervisor agent parses user intent and routes execution to specialized sub-agents (e.g., JD Parsing Agent, RAG Screening Agent, Interview Prep Agent).
- **Graceful Failover**: Model connections are distributed across multiple providers (Gemini, Groq) using a round-robin failover strategy, guaranteeing high availability even during API outages.
- **Human-in-the-loop (HITL)**: High-stakes operations, such as sending candidate emails or locking interview calendar slots, are strictly gated behind explicit human confirmation.
- **Strict Data Validation**: Output from all agents is piped through rigorous Pydantic schema validation to ensure frontend components always receive perfectly typed, parseable data.

### Workflow Visualization Diagram

```mermaid
graph TD;
	__start__([__start__]) --> supervisor_agent;
	supervisor_agent -.-> fallback;
	supervisor_agent -.-> hitl_confirm;
	supervisor_agent -.-> interview_salary_agent;
	supervisor_agent -.-> jd_agent;
	supervisor_agent -.-> screening_agent;
	fallback --> __end__([__end__]);
	hitl_confirm --> __end__;
	interview_salary_agent --> __end__;
	jd_agent --> __end__;
	screening_agent --> __end__;
```

## Setup & Installation

### Backend Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```
2. Configure environment variables (copy `backend/.env.example` to `backend/.env`):
   ```text
   GEMINI_API_KEY=your_api_key
   GROQ_API_KEY=your_api_key
   TAVILY_API_KEY=your_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
3. Initialize Supabase tables by running `backend/scripts/init_db.sql`.
4. Run the backend server:
   ```bash
   python backend/run.py
   ```

### Frontend Setup

1. Install dependencies and start the development server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:3000` to interact with the platform.

## Conclusion

RecruitAI redefines the technical recruiting process by replacing manual screening and guesswork with precision, speed, and unbiased clarity. By coupling an elite-tier user experience with an uncompromising agentic backend, it empowers hiring teams to identify top-tier talent faster, fairer, and with absolute confidence.
