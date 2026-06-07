import { telemetry } from "./telemetry";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import {
  AggregationType,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

const apiPort = Number(process.env.PORT ?? 3000);
const fakeExternalPort = Number(process.env.FAKE_EXTERNAL_PORT ?? 4001);
const collectorEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://127.0.0.1:4318";
const serviceName = process.env.OTEL_SERVICE_NAME ?? "newrelic-apm-pattern-sample-collector";
const exporterHeaders = getOtlpHeaders();

const sdk = new NodeSDK({
  serviceName,
  traceExporter: new OTLPTraceExporter({
    url: `${collectorEndpoint}/v1/traces`,
    headers: exporterHeaders,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${collectorEndpoint}/v1/metrics`,
      headers: exporterHeaders,
    }),
  }),
  logRecordProcessors: [
    new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: `${collectorEndpoint}/v1/logs`,
        headers: exporterHeaders,
      }),
    ),
  ],
  views: [
    {
      instrumentName: "http.server.request.duration",
      aggregation: {
        type: AggregationType.EXPONENTIAL_HISTOGRAM,
        options: {
          maxSize: 160,
          recordMinMax: true,
        },
      },
    },
    {
      instrumentName: "http.client.request.duration",
      aggregation: {
        type: AggregationType.EXPONENTIAL_HISTOGRAM,
        options: {
          maxSize: 160,
          recordMinMax: true,
        },
      },
    },
    {
      instrumentName: "checkout.duration",
      aggregation: {
        type: AggregationType.EXPONENTIAL_HISTOGRAM,
        options: {
          maxSize: 160,
          recordMinMax: true,
        },
      },
    },
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-pg": {
        enabled: false,
      },
    }),
    new PgInstrumentation({
      enhancedDatabaseReporting: true,
    }),
  ],
});

async function main() {
  await sdk.start();

  const {
    getDatabaseUrl,
    OrderService,
    PostgresOrderStore,
    startOrderSampleRuntime,
    createHttpExternalGateway,
  } = await import("sample-core");
  const { createApiApp } = await import("./api/app");
  const { createFakeExternalApp } = await import("./external/fakeExternalServer");

  const gateway = createHttpExternalGateway({
    baseUrl: `http://127.0.0.1:${fakeExternalPort}`,
    timeoutMs: 3_000,
  });
  const store = new PostgresOrderStore({
    connectionString: getDatabaseUrl(),
  });
  await store.init();

  const orderService = new OrderService(store, gateway, telemetry);
  const runtime = await startOrderSampleRuntime({
    apiPort,
    fakeExternalPort,
    createFakeExternalApp,
    createApiApp: () => createApiApp(orderService, telemetry),
    onShutdown: () => store.close(),
  });

  console.log(`API listening on http://127.0.0.1:${apiPort}`);
  console.log(`Fake external listening on http://127.0.0.1:${fakeExternalPort}`);
  console.log(`OTLP exporter targeting ${collectorEndpoint}`);

  const shutdown = async () => {
    await runtime.shutdown();
    await sdk.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
  console.error("failed to start application", error);
  await sdk.shutdown().catch(() => {});
  process.exit(1);
});

function getOtlpHeaders() {
  const explicitHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  if (explicitHeaders) {
    return Object.fromEntries(
      explicitHeaders
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const separatorIndex = entry.indexOf("=");
          if (separatorIndex === -1) {
            return [entry, ""];
          }

          return [
            entry.slice(0, separatorIndex).trim(),
            entry.slice(separatorIndex + 1).trim(),
          ];
        }),
    );
  }

  if (process.env.NEW_RELIC_LICENSE_KEY) {
    return {
      "api-key": process.env.NEW_RELIC_LICENSE_KEY,
    };
  }

  return undefined;
}
