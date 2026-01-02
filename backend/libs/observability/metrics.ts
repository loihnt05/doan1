import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create registry
export const register = new Registry();

// Collect default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register });

// ==================== HTTP METRICS ====================

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['service'],
  registers: [register],
});

// ==================== KAFKA METRICS ====================

export const kafkaMessagesProduced = new Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total number of Kafka messages produced',
  labelNames: ['topic', 'service'],
  registers: [register],
});

export const kafkaMessagesConsumed = new Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total number of Kafka messages consumed',
  labelNames: ['topic', 'consumer_group', 'service'],
  registers: [register],
});

export const kafkaMessageProcessingDuration = new Histogram({
  name: 'kafka_message_processing_duration_seconds',
  help: 'Kafka message processing duration in seconds',
  labelNames: ['topic', 'event_type', 'service'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const kafkaConsumerLag = new Gauge({
  name: 'kafka_consumer_lag',
  help: 'Kafka consumer lag (messages behind)',
  labelNames: ['topic', 'consumer_group', 'partition'],
  registers: [register],
});

// ==================== DISTRIBUTED LOCK METRICS ====================

export const lockAcquisitionsTotal = new Counter({
  name: 'lock_acquisitions_total',
  help: 'Total number of lock acquisition attempts',
  labelNames: ['resource', 'status', 'service'], // status: success/failure
  registers: [register],
});

export const lockHoldDuration = new Histogram({
  name: 'lock_hold_duration_seconds',
  help: 'Duration a lock was held in seconds',
  labelNames: ['resource', 'service'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const lockContentions = new Counter({
  name: 'lock_contentions_total',
  help: 'Total number of lock contentions (failed to acquire)',
  labelNames: ['resource', 'service'],
  registers: [register],
});

export const fencedTokenRejections = new Counter({
  name: 'fenced_token_rejections_total',
  help: 'Total number of operations rejected due to stale fenced tokens',
  labelNames: ['resource', 'service'],
  registers: [register],
});

// ==================== SAGA METRICS ====================

export const sagaExecutions = new Counter({
  name: 'saga_executions_total',
  help: 'Total number of saga executions',
  labelNames: ['saga_type', 'status', 'service'], // status: success/failed/compensated
  registers: [register],
});

export const sagaDuration = new Histogram({
  name: 'saga_duration_seconds',
  help: 'Saga execution duration in seconds',
  labelNames: ['saga_type', 'status', 'service'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const compensationExecutions = new Counter({
  name: 'compensation_executions_total',
  help: 'Total number of compensation actions executed',
  labelNames: ['saga_type', 'step', 'service'],
  registers: [register],
});

// ==================== BUSINESS METRICS ====================

export const ordersCreated = new Counter({
  name: 'orders_created_total',
  help: 'Total number of orders created',
  labelNames: ['status', 'service'],
  registers: [register],
});

export const paymentsProcessed = new Counter({
  name: 'payments_processed_total',
  help: 'Total number of payments processed',
  labelNames: ['status', 'service'], // status: success/failed
  registers: [register],
});

export const revenue = new Counter({
  name: 'revenue_total',
  help: 'Total revenue in cents',
  labelNames: ['currency', 'service'],
  registers: [register],
});

// ==================== NODE.JS SPECIFIC METRICS ====================

export const eventLoopLag = new Gauge({
  name: 'nodejs_eventloop_lag_seconds',
  help: 'Event loop lag in seconds',
  registers: [register],
});

export const activeHandles = new Gauge({
  name: 'nodejs_active_handles',
  help: 'Number of active handles',
  registers: [register],
});

export const activeRequests = new Gauge({
  name: 'nodejs_active_requests',
  help: 'Number of active requests',
  registers: [register],
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Start timer for histogram measurement
 * @returns Function to stop timer and record value
 */
export function startTimer(histogram: Histogram<string>) {
  return histogram.startTimer();
}

/**
 * Increment counter
 */
export function incrementCounter(counter: Counter<string>, labels: Record<string, string | number> = {}) {
  counter.inc(labels);
}

/**
 * Set gauge value
 */
export function setGauge(gauge: Gauge<string>, value: number, labels: Record<string, string | number> = {}) {
  gauge.set(labels, value);
}

/**
 * Observe histogram value
 */
export function observeHistogram(
  histogram: Histogram<string>,
  value: number,
  labels: Record<string, string | number> = {}
) {
  histogram.observe(labels, value);
}
