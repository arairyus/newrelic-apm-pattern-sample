declare module "newrelic" {
  type AttributeValue = string | number | boolean | undefined;

  const newrelic: {
    getTraceMetadata(): {
      traceId?: string;
      spanId?: string;
    };
    recordMetric(name: string, value: number): void;
    recordLogEvent(event: {
      timestamp: number;
      level: string;
      message: string;
      trace_id?: string;
      span_id?: string;
      [key: string]: AttributeValue;
    }): void;
  };

  export default newrelic;
}
