import { randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";
import type { CreateOrderRequest, Order } from "./types";

function calculateAmount(items: CreateOrderRequest["items"]) {
  const totalCents = items.reduce(
    (sum, item) => sum + item.quantity * Math.round(item.unitPrice * 100),
    0,
  );
  return totalCents / 100;
}

export type OrderStore = {
  createDraft(input: CreateOrderRequest): Promise<Order>;
  getById(id: string): Promise<Order | undefined>;
  save(order: Order): Promise<Order>;
  close?(): Promise<void>;
};

export class InMemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, Order>();

  async createDraft(input: CreateOrderRequest): Promise<Order> {
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

  async getById(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async save(order: Order): Promise<Order> {
    const next = {
      ...order,
      updatedAt: new Date().toISOString(),
    };

    this.orders.set(next.id, next);
    return next;
  }
}

export class PostgresOrderStore implements OrderStore {
  private readonly pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async init() {
    await this.withRetry(() =>
      this.pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id uuid PRIMARY KEY,
          user_id text NOT NULL,
          items jsonb NOT NULL,
          amount numeric NOT NULL,
          status text NOT NULL,
          payment_id text,
          failure_reason text,
          created_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL
        )
      `),
    );
  }

  async createDraft(input: CreateOrderRequest): Promise<Order> {
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

    await this.pool.query(
      `
        INSERT INTO orders (
          id,
          user_id,
          items,
          amount,
          status,
          payment_id,
          failure_reason,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
      `,
      [
        order.id,
        order.userId,
        JSON.stringify(order.items),
        order.amount,
        order.status,
        order.paymentId ?? null,
        order.failureReason ?? null,
        order.createdAt,
        order.updatedAt,
      ],
    );

    return order;
  }

  async getById(id: string): Promise<Order | undefined> {
    const result = await this.pool.query(
      `
        SELECT
          id,
          user_id,
          items,
          amount,
          status,
          payment_id,
          failure_reason,
          created_at,
          updated_at
        FROM orders
        WHERE id = $1
      `,
      [id],
    );

    const row = result.rows[0];
    return row ? rowToOrder(row) : undefined;
  }

  async save(order: Order): Promise<Order> {
    const next = {
      ...order,
      updatedAt: new Date().toISOString(),
    };

    const result = await this.pool.query(
      `
        UPDATE orders
        SET
          user_id = $2,
          items = $3::jsonb,
          amount = $4,
          status = $5,
          payment_id = $6,
          failure_reason = $7,
          updated_at = $8
        WHERE id = $1
        RETURNING
          id,
          user_id,
          items,
          amount,
          status,
          payment_id,
          failure_reason,
          created_at,
          updated_at
      `,
      [
        next.id,
        next.userId,
        JSON.stringify(next.items),
        next.amount,
        next.status,
        next.paymentId ?? null,
        next.failureReason ?? null,
        next.updatedAt,
      ],
    );

    if (!result.rows[0]) {
      throw new Error(`order not found: ${next.id}`);
    }

    return rowToOrder(result.rows[0]);
  }

  async close() {
    await this.pool.end();
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    throw lastError;
  }
}

function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    items: row.items as Order["items"],
    amount: Number(row.amount),
    status: row.status as Order["status"],
    paymentId: row.payment_id ? String(row.payment_id) : undefined,
    failureReason: row.failure_reason ? String(row.failure_reason) : undefined,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}
