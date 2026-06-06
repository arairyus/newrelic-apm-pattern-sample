export type OrderItem = {
  sku: string;
  quantity: number;
  unitPrice: number;
};

export type OrderStatus = "created" | "confirmed" | "failed";

export type Order = {
  id: string;
  userId: string;
  items: OrderItem[];
  amount: number;
  status: OrderStatus;
  paymentId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrderRequest = {
  userId: string;
  items: OrderItem[];
  paymentToken: string;
};

export type ChargeRequest = {
  orderId: string;
  userId: string;
  amount: number;
  paymentToken: string;
};

export type ChargeResponse = {
  chargeId: string;
  status: "approved";
};
