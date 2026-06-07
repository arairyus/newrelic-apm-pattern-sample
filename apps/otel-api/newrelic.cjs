"use strict";

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME ?? "newrelic-apm-pattern-sample-otel-api"],
  license_key: process.env.NEW_RELIC_LICENSE_KEY ?? "",
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL ?? "info",
  },
  opentelemetry: {
    enabled: true,
    traces: {
      enabled: true,
    },
  },
};
