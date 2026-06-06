import type { ChargeResponse, CreateOrderRequest, Order } from "./types";
import { OrderStore } from "./orderStore";

export type ExternalGateway = {
  charge(input: {
    orderId: string;
    userId: string;
    amount: number;
    paymentToken: string;
  }): Promise<ChargeResponse>;
};

export class OrderService {
  constructor(
    private readonly store: OrderStore,
    private readonly gateway: ExternalGateway,
  ) {}

  validateCreateOrderRequest(input: unknown): CreateOrderRequest {
    if (!isObject(input)) {
      throw new Error("request body must be an object");
    }

    const { userId, items, paymentToken } = input as Record<string, unknown>;

    if (typeof userId !== "string" || userId.trim() === "") {
      throw new Error("userId is required");
    }

    if (typeof paymentToken !== "string" || paymentToken.trim() === "") {
      throw new Error("paymentToken is required");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("items must be a non-empty array");
    }

    const normalizedItems = items.map((item, index) => {
      if (!isObject(item)) {
        throw new Error(`items[${index}] must be an object`);
      }

      const { sku, quantity, unitPrice } = item as Record<string, unknown>;

      if (typeof sku !== "string" || sku.trim() === "") {
        throw new Error(`items[${index}].sku is required`);
      }

      if (!isPositiveInteger(quantity)) {
        throw new Error(`items[${index}].quantity must be a positive integer`);
      }

      if (!isPositiveNumber(unitPrice)) {
        throw new Error(`items[${index}].unitPrice must be a positive number`);
      }

      return {
        sku,
        quantity,
        unitPrice,
      };
    });

    return {
      userId,
      paymentToken,
      items: normalizedItems,
    };
  }

  async createOrder(input: CreateOrderRequest): Promise<Order> {
    const draft = this.store.createDraft(input);

    try {
      const charge = await this.gateway.charge({
        orderId: draft.id,
        userId: draft.userId,
        amount: draft.amount,
        paymentToken: input.paymentToken,
      });

      return this.store.save({
        ...draft,
        status: "confirmed",
        paymentId: charge.chargeId,
      });
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "payment failed";

      return this.store.save({
        ...draft,
        status: "failed",
        failureReason,
      });
    }
  }

  getOrder(id: string): Order | undefined {
    return this.store.getById(id);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
