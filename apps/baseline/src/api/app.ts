import express, { type Express } from "express";
import {
  OrderConfirmationError,
  RequestValidationError,
} from "sample-core";
import type { OrderService, OrderTelemetry } from "sample-core";
import { createNoopOrderTelemetry } from "sample-core";

export function createApiApp(
  orderService: OrderService,
  telemetry: OrderTelemetry = createNoopOrderTelemetry(),
): Express {
  const app = express();

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
      if (error instanceof RequestValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }

      if (error instanceof OrderConfirmationError) {
        res.status(500).json({
          error: "payment approved but order confirmation failed",
          orderId: error.orderId,
          paymentId: error.paymentId,
        });
        return;
      }

      const message = error instanceof Error ? error.message : "internal server error";
      res.status(500).json({ error: message });
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
