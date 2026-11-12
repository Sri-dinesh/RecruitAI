/**
 * Port of `backend/app/core/telemetry.py` (OPS-1).
 *
 * In-memory RED (Rate, Errors, Duration) and USE (Utilization, Saturation,
 * Errors) metrics with Prometheus-compatible export. Node is single-threaded,
 * so the Python `threading.Lock` is unnecessary; the data structures and the
 * exported shapes are unchanged.
 */

export interface LatencyPercentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
}

export interface RedMetricsSummary {
  uptime_seconds: number;
  red_metrics: {
    requests_total: number;
    errors_total: number;
    error_rate: number;
    status_breakdown: Record<string, number>;
    error_breakdown: Record<string, number>;
    latencies_ms: Record<string, LatencyPercentiles>;
  };
  use_metrics: {
    queue_depth: number;
    active_workers: number;
  };
  token_accounting: {
    tokens_in_total: number;
    tokens_out_total: number;
    cost_usd_total: number;
  };
  slo_health: {
    availability_target_percent: number;
    current_availability_percent: number;
    slo_compliant: boolean;
  };
}

/** Sliding window size per endpoint, matching Python. */
export const MAX_LATENCY_SAMPLES = 500;

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export class RedMetricsRegistry {
  private readonly requestsTotal = new Map<string, number>();
  private readonly errorsTotal = new Map<string, number>();
  private readonly latenciesMs = new Map<string, number[]>();
  private queueDepth = 0;
  private activeWorkers = 0;
  private tokensInTotal = 0;
  private tokensOutTotal = 0;
  private costUsdTotal = 0;
  private startTime: number;

  /** `now` returns seconds since epoch, like Python's `time.time()`. */
  constructor(private readonly now: () => number = () => Date.now() / 1000) {
    this.startTime = this.now();
  }

  /**
   * Record one completed request. `_tenantId` is accepted for signature parity
   * with Python but not stored: tenant ids must not become metric labels.
   */
  recordRequest(endpoint: string, statusCode: number, latencyMs: number, _tenantId?: string): void {
    const key = `${endpoint}:${statusCode}`;
    this.requestsTotal.set(key, (this.requestsTotal.get(key) ?? 0) + 1);

    if (statusCode >= 400) {
      const errorKey = `${endpoint}:${statusCode >= 500 ? '5xx' : '4xx'}`;
      this.errorsTotal.set(errorKey, (this.errorsTotal.get(errorKey) ?? 0) + 1);
    }

    const samples = this.latenciesMs.get(endpoint) ?? [];
    samples.push(latencyMs);
    if (samples.length > MAX_LATENCY_SAMPLES) {
      samples.shift();
    }
    this.latenciesMs.set(endpoint, samples);
  }

  recordQueueState(depth: number, activeWorkers = 0): void {
    this.queueDepth = depth;
    this.activeWorkers = activeWorkers;
  }

  recordTokens(tokensIn: number, tokensOut: number, costUsd: number): void {
    this.tokensInTotal += tokensIn;
    this.tokensOutTotal += tokensOut;
    this.costUsdTotal += costUsd;
  }

  private computePercentiles(samples: readonly number[]): LatencyPercentiles {
    if (samples.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, avg: 0 };
    }
    const sorted = [...samples].sort((left, right) => left - right);
    const count = sorted.length;
    const at = (index: number): number => sorted[index] ?? 0;
    return {
      // Python int(n * q) truncates toward zero; values are non-negative.
      p50: roundTo(at(Math.trunc(count * 0.5)), 2),
      p90: roundTo(at(Math.min(count - 1, Math.trunc(count * 0.9))), 2),
      p95: roundTo(at(Math.min(count - 1, Math.trunc(count * 0.95))), 2),
      p99: roundTo(at(Math.min(count - 1, Math.trunc(count * 0.99))), 2),
      avg: roundTo(sorted.reduce((sum, value) => sum + value, 0) / count, 2),
    };
  }

  getSummary(): RedMetricsSummary {
    const totalRequests = [...this.requestsTotal.values()].reduce((sum, value) => sum + value, 0);
    const totalErrors = [...this.errorsTotal.values()].reduce((sum, value) => sum + value, 0);
    const errorRate = totalRequests > 0 ? roundTo(totalErrors / totalRequests, 4) : 0;

    const latencies: Record<string, LatencyPercentiles> = {};
    for (const [endpoint, samples] of this.latenciesMs) {
      latencies[endpoint] = this.computePercentiles(samples);
    }

    return {
      uptime_seconds: roundTo(this.now() - this.startTime, 2),
      red_metrics: {
        requests_total: totalRequests,
        errors_total: totalErrors,
        error_rate: errorRate,
        status_breakdown: Object.fromEntries(this.requestsTotal),
        error_breakdown: Object.fromEntries(this.errorsTotal),
        latencies_ms: latencies,
      },
      use_metrics: {
        queue_depth: this.queueDepth,
        active_workers: this.activeWorkers,
      },
      token_accounting: {
        tokens_in_total: this.tokensInTotal,
        tokens_out_total: this.tokensOutTotal,
        cost_usd_total: roundTo(this.costUsdTotal, 6),
      },
      slo_health: {
        availability_target_percent: 99.9,
        current_availability_percent: roundTo((1 - errorRate) * 100, 2),
        slo_compliant: errorRate <= 0.001,
      },
    };
  }

  toPrometheusFormat(): string {
    const lines: string[] = [
      '# HELP recruitai_requests_total Total HTTP requests handled',
      '# TYPE recruitai_requests_total counter',
    ];
    for (const [key, count] of this.requestsTotal) {
      const separator = key.lastIndexOf(':');
      const endpoint = separator === -1 ? key : key.slice(0, separator);
      const status = separator === -1 ? '' : key.slice(separator + 1);
      lines.push(`recruitai_requests_total{endpoint="${endpoint}",status="${status}"} ${count}`);
    }

    lines.push(
      '# HELP recruitai_queue_depth Current asynchronous job queue depth',
      '# TYPE recruitai_queue_depth gauge',
      `recruitai_queue_depth ${this.queueDepth}`,
      '# HELP recruitai_tokens_total Cumulative tokens processed by AI models',
      '# TYPE recruitai_tokens_total counter',
      `recruitai_tokens_total{type="input"} ${this.tokensInTotal}`,
      `recruitai_tokens_total{type="output"} ${this.tokensOutTotal}`,
      '# HELP recruitai_llm_cost_usd Cumulative estimated AI cost in USD',
      '# TYPE recruitai_llm_cost_usd counter',
      `recruitai_llm_cost_usd ${this.costUsdTotal.toFixed(6)}`,
    );

    return `${lines.join('\n')}\n`;
  }

  /** Test helper: clear every counter and restart the uptime clock. */
  reset(): void {
    this.requestsTotal.clear();
    this.errorsTotal.clear();
    this.latenciesMs.clear();
    this.queueDepth = 0;
    this.activeWorkers = 0;
    this.tokensInTotal = 0;
    this.tokensOutTotal = 0;
    this.costUsdTotal = 0;
    this.startTime = this.now();
  }
}

/** Global metrics collector, mirroring `metrics_registry`. */
export const metricsRegistry = new RedMetricsRegistry();
