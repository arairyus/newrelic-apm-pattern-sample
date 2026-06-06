import express, { type Express } from "express";
import type { OrderService } from "../../../packages/sample-core/src";

export function createApiApp(orderService: OrderService): Express {
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
      const input = orderService.validateCreateOrderRequest(req.body);
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

  app.get("/orders/:id", (req, res) => {
    const order = orderService.getOrder(req.params.id);

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
