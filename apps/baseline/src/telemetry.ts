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
    return newrelic.startSegment(name, true, async () => {
      newrelic.addCustomAttributes(normalizeAttributes(attributes));

      try {
        return await fn();
      } catch (error) {
        newrelic.noticeError(error as Error, normalizeAttributes(attributes));
        throw error;
      }
    }) as Promise<T>;
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
