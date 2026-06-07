export type TelemetryAttributeValue = string | number | boolean | undefined;

export type TelemetryAttributes = Record<string, TelemetryAttributeValue>;

export type OrderTelemetry = {
  runInSpan<T>(
    name: string,
    attributes: TelemetryAttributes,
    fn: () => T | Promise<T>,
  ): Promise<T>;
  recordMetric(
    name: string,
    value: number,
    attributes?: TelemetryAttributes,
  ): void;
  log(
    level: "info" | "warn" | "error",
    message: string,
    attributes?: TelemetryAttributes,
  ): void;
};

export function createNoopOrderTelemetry(): OrderTelemetry {
  return {
    async runInSpan(_name, _attributes, fn) {
      return fn();
    },
    recordMetric() {},
    log() {},
  };
}
