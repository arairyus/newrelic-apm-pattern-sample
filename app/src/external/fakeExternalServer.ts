import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import type { ChargeRequest, ChargeResponse } from "../../../packages/sample-core/src";

export function createFakeExternalApp(): Express {
  const app = express();
  app.use(express.json());

  app.post("/charge", async (req, res) => {
    const result = await simulateCharge(req.body as Partial<ChargeRequest>);

    if (!result.ok) {
      res.status(402).json({
        error: result.error,
      });
      return;
    }

    const body: ChargeResponse = {
      chargeId: result.chargeId,
      status: "approved",
    };

    res.json(body);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

async function simulateCharge(input: Partial<ChargeRequest>) {
  await delay(80 + Math.floor(Math.random() * 120));

  if (
    typeof input.amount !== "number" ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0
  ) {
    return { ok: false as const, error: "invalid amount" };
  }

  if (typeof input.paymentToken !== "string" || input.paymentToken.trim() === "") {
    return { ok: false as const, error: "missing payment token" };
  }

  if (input.paymentToken.toLowerCase() === "declined") {
    return { ok: false as const, error: "card declined" };
  }

  return {
    ok: true as const,
    chargeId: randomUUID(),
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
