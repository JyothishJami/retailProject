/** How a branch tracks stock for a product (see docs Part 1, FR-E). */
export const InventoryMode = {
  /** Shop only says "in stock" / "out of stock". */
  AVAILABILITY_ONLY: 'AVAILABILITY_ONLY',
  /** Quantity tracked loosely; alerts fire below a threshold. */
  LOW_STOCK_THRESHOLD: 'LOW_STOCK_THRESHOLD',
  /** Quantity is authoritative and reserved on order placement. */
  TRACKED_QUANTITY: 'TRACKED_QUANTITY',
} as const;
export type InventoryMode = (typeof InventoryMode)[keyof typeof InventoryMode];

export const PaymentMode = {
  PAY_AT_STORE: 'PAY_AT_STORE',
  ONLINE: 'ONLINE',
} as const;
export type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];
