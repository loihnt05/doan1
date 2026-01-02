import pino from 'pino';

// Create logger based on environment
const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // Pretty print in development, JSON in production
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,

  // Base fields added to all logs
  base: {
    service: process.env.SERVICE_NAME || 'unknown',
    env: process.env.NODE_ENV || 'development',
  },

  // Timestamp
  timestamp: pino.stdTimeFunctions.isoTime,

  // Formatters
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
});

/**
 * Create child logger with additional context
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log with trace ID (for distributed tracing)
 */
export function logWithTrace(
  level: 'info' | 'error' | 'warn' | 'debug',
  message: string,
  traceId?: string,
  meta?: Record<string, any>
) {
  const logData = {
    ...meta,
    ...(traceId && { traceId }),
  };

  logger[level](logData, message);
}

/**
 * Log HTTP request
 */
export function logHttpRequest(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  traceId?: string
) {
  logger.info({
    type: 'http_request',
    method,
    url,
    statusCode,
    duration,
    ...(traceId && { traceId }),
  }, `${method} ${url} ${statusCode} ${duration}ms`);
}

/**
 * Log Kafka event
 */
export function logKafkaEvent(
  type: 'produced' | 'consumed',
  topic: string,
  eventType: string,
  eventId?: string,
  meta?: Record<string, any>
) {
  logger.info({
    type: 'kafka_event',
    action: type,
    topic,
    eventType,
    ...(eventId && { eventId }),
    ...meta,
  }, `Kafka ${type}: ${eventType} on ${topic}`);
}

/**
 * Log saga execution
 */
export function logSagaExecution(
  sagaType: string,
  step: string,
  status: 'started' | 'completed' | 'failed' | 'compensated',
  meta?: Record<string, any>
) {
  const level = status === 'failed' ? 'error' : 'info';
  
  logger[level]({
    type: 'saga',
    sagaType,
    step,
    status,
    ...meta,
  }, `Saga ${sagaType} - ${step}: ${status}`);
}

/**
 * Log distributed lock operation
 */
export function logLockOperation(
  operation: 'acquire' | 'release' | 'extend',
  resource: string,
  success: boolean,
  duration?: number,
  meta?: Record<string, any>
) {
  logger.info({
    type: 'distributed_lock',
    operation,
    resource,
    success,
    ...(duration !== undefined && { duration }),
    ...meta,
  }, `Lock ${operation} on ${resource}: ${success ? 'success' : 'failed'}`);
}

/**
 * Log error with stack trace
 */
export function logError(
  error: Error,
  context?: string,
  meta?: Record<string, any>
) {
  logger.error({
    type: 'error',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...(context && { context }),
    ...meta,
  }, error.message);
}
