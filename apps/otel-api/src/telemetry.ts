import { context, metrics, trace, type Span } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type {
  OrderTelemetry,
  TelemetryAttributes,
} from "sample-core";

const meter = metrics.getMeter("newrelic-apm-pattern-sample-otel-api");
const ordersCreatedCounter = meter.createCounter("orders.created");
const ordersFailedCounter = meter.createCounter("orders.failed");
const checkoutDurationHistogram = meter.createHistogram("checkout.duration");

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
  recordMetric(name, value, attributes) {
    const normalizedAttributes = normalizeAttributes(attributes);

    switch (name) {
      case "orders.created":
        ordersCreatedCounter.add(value, normalizedAttributes);
        return;
      case "orders.failed":
        ordersFailedCounter.add(value, normalizedAttributes);
        return;
      case "checkout.duration":
        checkoutDurationHistogram.record(value, normalizedAttributes);
        return;
      default:
        checkoutDurationHistogram.record(value, normalizedAttributes);
    }
  },
  log(level, message, attributes) {
    const span = trace.getSpan(context.active());
    const spanContext = span?.spanContext();
    const normalizedAttributes = {
      ...normalizeAttributes(attributes),
      trace_id: spanContext?.traceId,
      span_id: spanContext?.spanId,
    };

    logs.getLogger("newrelic-apm-pattern-sample-otel-api").emit({
      timestamp: Date.now(),
      severityNumber: severityNumberFor(level),
      severityText: level.toUpperCase(),
      body: message,
      attributes: normalizedAttributes,
    });
  },
};

function normalizeAttributes(attributes?: TelemetryAttributes) {
  return Object.fromEntries(
    Object.entries(attributes ?? {}).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean>;
}

function severityNumberFor(level: "info" | "warn" | "error") {
  switch (level) {
    case "error":
      return SeverityNumber.ERROR;
    case "warn":
      return SeverityNumber.WARN;
    default:
      return SeverityNumber.INFO;
  }
}
