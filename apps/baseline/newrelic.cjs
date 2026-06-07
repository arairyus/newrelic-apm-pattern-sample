"use strict";

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME ?? "newrelic-apm-pattern-sample-baseline"],
  license_key: process.env.NEW_RELIC_LICENSE_KEY ?? "",
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL ?? "info",
  },
  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
    },
    metrics: {
      enabled: true,
    },
  },
};
