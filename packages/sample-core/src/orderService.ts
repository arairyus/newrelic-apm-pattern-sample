import type { ChargeResponse, CreateOrderRequest, Order } from "./types";
import type { OrderStore } from "./orderStore";
import {
  createNoopOrderTelemetry,
  type OrderTelemetry,
} from "./telemetry";

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
    private readonly telemetry: OrderTelemetry = createNoopOrderTelemetry(),
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
    return this.telemetry.runInSpan(
      "process-order",
      {
        user_id: input.userId,
      },
      async () => {
        const startedAt = Date.now();
        this.telemetry.log("info", "order processing started", {
          event_name: "order.processing.started",
          user_id: input.userId,
          item_count: input.items.length,
        });

        const draft = await this.telemetry.runInSpan(
          "db.create-order-draft",
          {
            "db.system": "postgresql",
            "db.operation": "INSERT",
            "db.sql.table": "orders",
          },
          () => this.store.createDraft(input),
        );
        this.telemetry.log("info", "order draft persisted", {
          event_name: "order.db.draft.persisted",
          order_id: draft.id,
          user_id: draft.userId,
          amount: draft.amount,
          status: draft.status,
          db_operation: "INSERT",
        });

        try {
          this.telemetry.log("info", "payment charge requested", {
            event_name: "payment.charge.requested",
            order_id: draft.id,
            user_id: draft.userId,
            amount: draft.amount,
          });
          const charge = await this.telemetry.runInSpan(
            "charge-payment",
            {
              order_id: draft.id,
              user_id: draft.userId,
              amount: draft.amount,
            },
            () =>
              this.gateway.charge({
                orderId: draft.id,
                userId: draft.userId,
                amount: draft.amount,
                paymentToken: input.paymentToken,
              }),
          );
          this.telemetry.log("info", "payment charge approved", {
            event_name: "payment.charge.approved",
            order_id: draft.id,
            user_id: draft.userId,
            amount: draft.amount,
            payment_id: charge.chargeId,
          });

          const confirmed = await this.telemetry.runInSpan(
            "db.confirm-order",
            {
              "db.system": "postgresql",
              "db.operation": "UPDATE",
              "db.sql.table": "orders",
              order_id: draft.id,
            },
            () =>
              this.store.save({
                ...draft,
                status: "confirmed",
                paymentId: charge.chargeId,
              }),
          );
          this.telemetry.log("info", "order status persisted", {
            event_name: "order.db.status.persisted",
            order_id: confirmed.id,
            user_id: confirmed.userId,
            status: confirmed.status,
            db_operation: "UPDATE",
          });

          this.telemetry.recordMetric("orders.created", 1, {
            user_id: confirmed.userId,
            status: confirmed.status,
          });
          this.telemetry.recordMetric("checkout.duration", Date.now() - startedAt, {
            outcome: "success",
          });
          this.telemetry.log("info", "order confirmed", {
            event_name: "order.confirmed",
            order_id: confirmed.id,
            user_id: confirmed.userId,
            amount: confirmed.amount,
            payment_id: confirmed.paymentId,
            status: confirmed.status,
          });

          return confirmed;
        } catch (error) {
          const failureReason =
            error instanceof Error ? error.message : "payment failed";
          this.telemetry.log("warn", "order processing failed before final state", {
            event_name: "order.processing.failure_detected",
            order_id: draft.id,
            user_id: draft.userId,
            amount: draft.amount,
            failure_reason: failureReason,
          });
          const failed = await this.telemetry.runInSpan(
            "db.fail-order",
            {
              "db.system": "postgresql",
              "db.operation": "UPDATE",
              "db.sql.table": "orders",
              order_id: draft.id,
            },
            () =>
              this.store.save({
                ...draft,
                status: "failed",
                failureReason,
              }),
          );
          this.telemetry.log("info", "failed order status persisted", {
            event_name: "order.db.failure.persisted",
            order_id: failed.id,
            user_id: failed.userId,
            status: failed.status,
            db_operation: "UPDATE",
          });

          this.telemetry.recordMetric("orders.failed", 1, {
            user_id: failed.userId,
            status: failed.status,
          });
          this.telemetry.recordMetric("checkout.duration", Date.now() - startedAt, {
            outcome: "failure",
          });
          this.telemetry.log("error", "order failed", {
            event_name: "order.failed",
            order_id: failed.id,
            user_id: failed.userId,
            amount: failed.amount,
            failure_reason: failureReason,
            status: failed.status,
          });

          return failed;
        }
      },
    );
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const order = await this.telemetry.runInSpan(
      "db.get-order",
      {
        "db.system": "postgresql",
        "db.operation": "SELECT",
        "db.sql.table": "orders",
        order_id: id,
      },
      () => this.store.getById(id),
    );
    this.telemetry.log("info", "order lookup completed", {
      event_name: "order.lookup.completed",
      order_id: id,
      found: Boolean(order),
      status: order?.status,
      db_operation: "SELECT",
    });

    return order;
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
