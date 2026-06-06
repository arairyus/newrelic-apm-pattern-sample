import { randomUUID } from "node:crypto";
import type { CreateOrderRequest, Order } from "./types";

function calculateAmount(items: CreateOrderRequest["items"]) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export class OrderStore {
  private readonly orders = new Map<string, Order>();

  createDraft(input: CreateOrderRequest): Order {
    const now = new Date().toISOString();
    const order: Order = {
      id: randomUUID(),
      userId: input.userId,
      items: input.items,
      amount: calculateAmount(input.items),
      status: "created",
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.id, order);
    return order;
  }

  getById(id: string): Order | undefined {
    return this.orders.get(id);
  }

  save(order: Order): Order {
    const next = {
      ...order,
      updatedAt: new Date().toISOString(),
    };

    this.orders.set(next.id, next);
    return next;
  }
}
