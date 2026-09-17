"""
backend/app/core/telemetry.py
-----------------------------
Production Distributed Tracing, RED/USE Metrics & SLO Monitoring (OPS-1).
Provides OpenTelemetry-compatible span tracing, latency percentile calculation,
and Prometheus-compatible metrics export for enterprise operations.
"""

import time
import math
import uuid
import logging
import threading
from contextlib import contextmanager
from typing import Optional, Dict, Any, List

logger = logging.getLogger("recruitai.telemetry")


class OpenTelemetrySpan:
    """Represents an active distributed trace span."""
    def __init__(self, name: str, trace_id: str, span_id: str, attributes: Optional[Dict[str, Any]] = None):
        self.name = name
        self.trace_id = trace_id
        self.span_id = span_id
        self.start_time = time.time()
        self.attributes = attributes or {}
        self.events: List[Dict[str, Any]] = []
        self.status = "OK"

    def set_attribute(self, key: str, value: Any) -> None:
        self.attributes[key] = value

    def add_event(self, name: str, attributes: Optional[Dict[str, Any]] = None) -> None:
        self.events.append({
            "name": name,
            "timestamp": time.time(),
            "attributes": attributes or {}
        })

    def finish(self, status: str = "OK") -> float:
        self.status = status
        duration_ms = (time.time() - self.start_time) * 1000
        logger.debug(f"[span:{self.name}] trace={self.trace_id[:8]} span={self.span_id[:8]} duration={duration_ms:.2f}ms status={status}")
        return duration_ms


@contextmanager
def trace_span(name: str, attributes: Optional[Dict[str, Any]] = None):
    """Context manager for distributed trace span generation."""
    trace_id = uuid.uuid4().hex
    span_id = uuid.uuid4().hex[:16]
    span = OpenTelemetrySpan(name, trace_id, span_id, attributes)
    try:
        yield span
        span.finish(status="OK")
    except Exception as exc:
        span.set_attribute("error", True)
        span.set_attribute("error.type", type(exc).__name__)
        span.finish(status="ERROR")
        raise


class REDMetricsRegistry:
    """
    In-memory RED (Rate, Errors, Duration) and USE (Utilization, Saturation, Errors)
    metrics collector with thread-safe lock-free sliding statistics.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._requests_total: Dict[str, int] = {}
        self._errors_total: Dict[str, int] = {}
        self._latencies_ms: Dict[str, List[float]] = {}
        self._queue_depth: int = 0
        self._active_workers: int = 0
        self._tokens_in_total: int = 0
        self._tokens_out_total: int = 0
        self._cost_usd_total: float = 0.0
        self._start_time: float = time.time()

    def record_request(self, endpoint: str, status_code: int, latency_ms: float, tenant_id: Optional[str] = None) -> None:
        with self._lock:
            # 1. Rates
            key = f"{endpoint}:{status_code}"
            self._requests_total[key] = self._requests_total.get(key, 0) + 1

            # 2. Errors
            if status_code >= 400:
                err_key = f"{endpoint}:{'5xx' if status_code >= 500 else '4xx'}"
                self._errors_total[err_key] = self._errors_total.get(err_key, 0) + 1

            # 3. Latencies (sliding window capped at 500 measurements per endpoint)
            if endpoint not in self._latencies_ms:
                self._latencies_ms[endpoint] = []
            l_list = self._latencies_ms[endpoint]
            l_list.append(latency_ms)
            if len(l_list) > 500:
                l_list.pop(0)

    def record_queue_state(self, depth: int, active_workers: int = 0) -> None:
        with self._lock:
            self._queue_depth = depth
            self._active_workers = active_workers

    def record_tokens(self, tokens_in: int, tokens_out: int, cost_usd: float) -> None:
        with self._lock:
            self._tokens_in_total += tokens_in
            self._tokens_out_total += tokens_out
            self._cost_usd_total += cost_usd

    def _compute_percentiles(self, samples: List[float]) -> Dict[str, float]:
        if not samples:
            return {"p50": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0, "avg": 0.0}
        s = sorted(samples)
        n = len(s)
        return {
            "p50": round(s[int(n * 0.50)], 2),
            "p90": round(s[min(n - 1, int(n * 0.90))], 2),
            "p95": round(s[min(n - 1, int(n * 0.95))], 2),
            "p99": round(s[min(n - 1, int(n * 0.99))], 2),
            "avg": round(sum(s) / n, 2),
        }

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            uptime = round(time.time() - self._start_time, 2)
            total_reqs = sum(self._requests_total.values())
            total_errs = sum(self._errors_total.values())
            error_rate = round((total_errs / total_reqs), 4) if total_reqs > 0 else 0.0

            latencies = {}
            for ep, samples in self._latencies_ms.items():
                latencies[ep] = self._compute_percentiles(samples)

            return {
                "uptime_seconds": uptime,
                "red_metrics": {
                    "requests_total": total_reqs,
                    "errors_total": total_errs,
                    "error_rate": error_rate,
                    "status_breakdown": dict(self._requests_total),
                    "error_breakdown": dict(self._errors_total),
                    "latencies_ms": latencies,
                },
                "use_metrics": {
                    "queue_depth": self._queue_depth,
                    "active_workers": self._active_workers,
                },
                "token_accounting": {
                    "tokens_in_total": self._tokens_in_total,
                    "tokens_out_total": self._tokens_out_total,
                    "cost_usd_total": round(self._cost_usd_total, 6),
                },
                "slo_health": {
                    "availability_target_percent": 99.9,
                    "current_availability_percent": round((1.0 - error_rate) * 100, 2),
                    "slo_compliant": error_rate <= 0.001,
                }
            }

    def to_prometheus_format(self) -> str:
        with self._lock:
            lines = [
                "# HELP recruitai_requests_total Total HTTP requests handled",
                "# TYPE recruitai_requests_total counter",
            ]
            for key, count in self._requests_total.items():
                ep, code = key.split(":")
                lines.append(f'recruitai_requests_total{{endpoint="{ep}",status="{code}"}} {count}')

            lines.extend([
                "# HELP recruitai_queue_depth Current asynchronous job queue depth",
                "# TYPE recruitai_queue_depth gauge",
                f"recruitai_queue_depth {self._queue_depth}",
                "# HELP recruitai_tokens_total Cumulative tokens processed by AI models",
                "# TYPE recruitai_tokens_total counter",
                f'recruitai_tokens_total{{type="input"}} {self._tokens_in_total}',
                f'recruitai_tokens_total{{type="output"}} {self._tokens_out_total}',
                "# HELP recruitai_llm_cost_usd Cumulative estimated AI cost in USD",
                "# TYPE recruitai_llm_cost_usd counter",
                f"recruitai_llm_cost_usd {self._cost_usd_total:.6f}",
            ])
            return "\n".join(lines) + "\n"


# Global metrics collector instance
metrics_registry = REDMetricsRegistry()
