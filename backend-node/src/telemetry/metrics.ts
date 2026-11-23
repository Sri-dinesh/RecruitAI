import { Counter, Gauge, Registry } from 'prom-client';

/**
 * Port of `backend/app/core/telemetry.py` (OPS-1).
 *
 * The JSON summary keeps Python's in-memory RED/USE shapes. The Prometheus
 * exposition is backed by a per-process `prom-client` registry (Phase 21), so
 * Prometheus scrapes and aggregates counters with the same metric names across
 * every replica; the Python process-local registry is no longer the export
 * source.
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
  /** Per-process prom-client registry exported at `/api/metrics`. */
  readonly prometheus = new Registry();

  private readonly requestsCounter = new Counter({
    name: 'recruitai_requests_total',
    help: 'Total HTTP requests handled',
    labelNames: ['endpoint', 'status'],
    registers: [this.prometheus],
  });
  private readonly queueDepthGauge = new Gauge({
    name: 'recruitai_queue_depth',
    help: 'Current asynchronous job queue depth',
    registers: [this.prometheus],
  });
  private readonly tokensCounter = new Counter({
    name: 'recruitai_tokens_total',
    help: 'Cumulative tokens processed by AI models',
    labelNames: ['type'],
    registers: [this.prometheus],
  });
  private readonly costCounter = new Counter({
    name: 'recruitai_llm_cost_usd',
    help: 'Cumulative estimated AI cost in USD',
    registers: [this.prometheus],
  });
  /** 0=closed, 1=half-open, 2=open (Phase 24). */
  private readonly dependencyCircuitGauge = new Gauge({
    name: 'recruitai_dependency_circuit_state',
    help: 'Circuit breaker state per external dependency',
    labelNames: ['dependency'],
    registers: [this.prometheus],
  });
  private readonly dependencyTripCounter = new Counter({
    name: 'recruitai_dependency_circuit_trips_total',
    help: 'Circuit breaker trips per external dependency and reason',
    labelNames: ['dependency', 'reason'],
    registers: [this.prometheus],
  });

  constructor(private readonly now: () => number = () => Date.now() / 1000) {
    // Emit zero-valued token series before the first LLM call, matching the
    // Python exposition shape that dashboards key on.
    this.tokensCounter.labels('input').inc(0);
    this.tokensCounter.labels('output').inc(0);
    this.startTime = this.now();
  }

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
  // (constructor above initializes the prom-client series and clock)

  /**
   * Record one completed request. `_tenantId` is accepted for signature parity
   * with Python but not stored: tenant ids must not become metric labels.
   */
  recordRequest(endpoint: string, statusCode: number, latencyMs: number, _tenantId?: string): void {
    const key = `${endpoint}:${statusCode}`;
    this.requestsTotal.set(key, (this.requestsTotal.get(key) ?? 0) + 1);
    this.requestsCounter.labels(endpoint, String(statusCode)).inc();

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
    this.queueDepthGauge.set(depth);
  }

  recordTokens(tokensIn: number, tokensOut: number, costUsd: number): void {
    this.tokensInTotal += tokensIn;
    this.tokensOutTotal += tokensOut;
    this.costUsdTotal += costUsd;
    this.tokensCounter.labels('input').inc(tokensIn);
    this.tokensCounter.labels('output').inc(tokensOut);
    this.costCounter.inc(costUsd);
  }

  /** Update the fleet-facing circuit gauge after a state transition. */
  recordDependencyCircuitState(dependency: string, state: 'CLOSED' | 'HALF_OPEN' | 'OPEN'): void {
    const value = state === 'OPEN' ? 2 : state === 'HALF_OPEN' ? 1 : 0;
    this.dependencyCircuitGauge.labels(dependency).set(value);
  }

  /** Count an OPEN transition; `reason` is bounded to known categories. */
  recordDependencyCircuitTrip(
    dependency: string,
    reason: 'failure_threshold' | 'rate_limit' | 'recovered',
  ): void {
    this.dependencyTripCounter.labels(dependency, reason).inc();
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

  /** Prometheus exposition from this process's prom-client registry. */
  async toPrometheusFormat(): Promise<string> {
    return this.prometheus.metrics();
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
    this.prometheus.resetMetrics();
  }
}

/** Global metrics collector, mirroring `metrics_registry`. */
export const metricsRegistry = new RedMetricsRegistry();
