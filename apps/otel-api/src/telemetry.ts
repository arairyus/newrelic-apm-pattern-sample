import { trace, type Span } from "@opentelemetry/api";
import newrelic from "newrelic";
import type {
  OrderTelemetry,
  TelemetryAttributes,
} from "sample-core";

export const telemetry: OrderTelemetry = {
  async runInSpan<T>(
    name: string,
    attributes: TelemetryAttributes,
    fn: () => T | Promise<T>,
  ) {
    const tracer = trace.getTracer("newrelic-apm-pattern-sample-otel-api");
    return tracer.startActiveSpan(
      name,
      { attributes: normalizeAttributes(attributes) },
      async (span: Span): Promise<T> => {
        try {
          const result = await fn();
          return result;
        } catch (error) {
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      },
    ) as Promise<T>;
  },
  recordMetric(name, value) {
    newrelic.recordMetric(`Custom/${name}`, value);
  },
  log(level, message, attributes) {
    const traceMetadata = newrelic.getTraceMetadata();
    const payload = {
      level,
      message,
      trace_id: traceMetadata.traceId,
      span_id: traceMetadata.spanId,
      ...normalizeAttributes(attributes),
    };

    newrelic.recordLogEvent({
      timestamp: Date.now(),
      ...payload,
    });

    if (level === "error") {
      console.error(JSON.stringify(payload));
      return;
    }

    console.log(JSON.stringify(payload));
  },
};

function normalizeAttributes(attributes?: TelemetryAttributes) {
  return Object.fromEntries(
    Object.entries(attributes ?? {}).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean>;
}
