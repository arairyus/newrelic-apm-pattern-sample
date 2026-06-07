import express from "express";
import { metrics } from "@opentelemetry/api";
import type {
  OrderService,
  OrderTelemetry,
} from "sample-core";
import { createNoopOrderTelemetry } from "sample-core";

const httpServerDuration = metrics
  .getMeter("newrelic-apm-pattern-sample-http")
  .createHistogram("http.server.request.duration", {
    unit: "s",
    description: "Duration of HTTP server requests.",
  });

export function createApiApp(
  orderService: OrderService,
  telemetry: OrderTelemetry = createNoopOrderTelemetry(),
) {
  const app = express();

  app.use(httpServerDurationMiddleware);
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "api",
    });
  });

  app.post("/orders", async (req, res) => {
    try {
      const input = await telemetry.runInSpan(
        "validate-order",
        {
          route: "/orders",
        },
        () => orderService.validateCreateOrderRequest(req.body),
      );
      const order = await orderService.createOrder(input);

      if (order.status === "failed") {
        res.status(402).json(order);
        return;
      }

      res.status(201).json(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid request";
      res.status(400).json({ error: message });
    }
  });

  app.get("/orders/:id", async (req, res) => {
    const order = await orderService.getOrder(req.params.id);

    if (!order) {
      res.status(404).json({ error: "order not found" });
      return;
    }

    res.json(order);
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  return app;
}

const httpServerDurationMiddleware: express.RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    const route = getRoute(req);

    httpServerDuration.record(durationSeconds, {
      "http.request.method": req.method,
      "http.response.status_code": res.statusCode,
      "http.route": route,
      "server.address": req.hostname,
      "server.port": Number(req.socket.localPort ?? 0),
      "url.scheme": req.protocol,
    });
  });

  next();
};

function getRoute(req: express.Request) {
  const routePath = req.route?.path;

  if (typeof routePath === "string") {
    return routePath;
  }

  return req.path;
}
