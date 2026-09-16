"""
backend/app/services/job_queue.py
---------------------------------
Asynchronous job queue and SSE event streaming manager for RecruitAI agent turns.
Decouples agent execution (p99 > 60s) from the synchronous HTTP request/response cycle.
"""

import uuid
import time
import asyncio
import logging
from typing import Dict, Any, Optional, AsyncGenerator
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Dedicated worker pool for agent invocations
_EXECUTOR = ThreadPoolExecutor(max_workers=10, thread_name_prefix="agent_worker_")


class AgentJob:
    def __init__(self, job_id: str, user_id: str, session_id: str):
        self.job_id = job_id
        self.user_id = user_id
        self.session_id = session_id
        self.status = "queued"  # queued, running, completed, failed
        self.created_at = time.time()
        self.updated_at = time.time()
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.steps: list = []
        self.event_queue: asyncio.Queue = asyncio.Queue()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "session_id": self.session_id,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "steps_count": len(self.steps),
            "result": self.result,
            "error": self.error,
        }


class ChatJobManager:
    """
    Manages in-flight and completed asynchronous agent execution jobs.
    Provides Server-Sent Events (SSE) streaming generators.
    """

    def __init__(self, ttl_seconds: float = 3600.0):
        self._jobs: Dict[str, AgentJob] = {}
        self._ttl_seconds = ttl_seconds

    def cleanup_stale_jobs(self) -> None:
        now = time.time()
        stale_keys = [
            jid for jid, job in self._jobs.items()
            if now - job.updated_at > self._ttl_seconds
        ]
        for jid in stale_keys:
            self._jobs.pop(jid, None)

    def create_job(self, user_id: str, session_id: str) -> AgentJob:
        self.cleanup_stale_jobs()
        job_id = str(uuid.uuid4())
        job = AgentJob(job_id=job_id, user_id=user_id, session_id=session_id)
        self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str, user_id: str) -> Optional[AgentJob]:
        job = self._jobs.get(job_id)
        if job and job.user_id == user_id:
            return job
        return None

    def start_job(
        self,
        job: AgentJob,
        fn,
        *args,
        **kwargs,
    ) -> None:
        """
        Dispatches execution to thread pool and pumps SSE events.
        """
        loop = asyncio.get_event_loop()
        loop.create_task(self._run_job(job, fn, *args, **kwargs))

    async def _run_job(self, job: AgentJob, fn, *args, **kwargs) -> None:
        job.status = "running"
        job.updated_at = time.time()
        await job.event_queue.put({"event": "status", "data": {"status": "running", "message": "Agent thinking..."}})

        loop = asyncio.get_running_loop()
        try:
            # Run heavy agent turn off the asyncio event loop
            result = await loop.run_in_executor(_EXECUTOR, lambda: fn(*args, **kwargs))
            job.status = "completed"
            job.result = result
            job.updated_at = time.time()
            await job.event_queue.put({"event": "complete", "data": result})
        except Exception as exc:
            logger.error(f"[ChatJobManager] Job {job.job_id} failed: {exc}", exc_info=True)
            job.status = "failed"
            job.error = str(exc)
            job.updated_at = time.time()
            await job.event_queue.put({"event": "error", "data": {"error": str(exc)}})
        finally:
            # End of stream sentinel
            await job.event_queue.put(None)

    async def stream_events(self, job: AgentJob) -> AsyncGenerator[str, None]:
        """
        Yields standard SSE formatted strings: `event: <name>\ndata: <json>\n\n`
        """
        import json

        # Send initial connection event
        yield f"event: init\ndata: {json.dumps({'job_id': job.job_id, 'status': job.status})}\n\n"

        # If already completed or failed, send final event immediately
        if job.status == "completed":
            yield f"event: complete\ndata: {json.dumps(job.result or {})}\n\n"
            return
        elif job.status == "failed":
            yield f"event: error\ndata: {json.dumps({'error': job.error})}\n\n"
            return

        while True:
            item = await job.event_queue.get()
            if item is None:
                break

            event_name = item.get("event", "message")
            data_str = json.dumps(item.get("data", {}))
            yield f"event: {event_name}\ndata: {data_str}\n\n"


# Global singleton job manager
job_manager = ChatJobManager()
