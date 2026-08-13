/**
 * Order lifecycle vocabulary shared by the API and every client.
 *
 * Statuses are values (not a TypeScript `enum`) so that they survive JSON
 * transport, database storage, and cross-package structural typing unchanged.
 */
export const OrderStatus = {
  CART: 'CART',
  ORDER_PLACED: 'ORDER_PLACED',
  RECEIVED: 'RECEIVED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  PACKING: 'PACKING',
  PACKED: 'PACKED',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  CUSTOMER_ARRIVED: 'CUSTOMER_ARRIVED',
  HANDED_OVER: 'HANDED_OVER',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUSES = Object.values(OrderStatus);

/** Statuses from which no further transition is possible. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
  OrderStatus.EXPIRED,
  OrderStatus.REFUNDED,
];

/** Every domain event that may move an order between statuses. */
export const OrderEvent = {
  PLACE: 'PLACE',
  MARK_RECEIVED: 'MARK_RECEIVED',
  ACCEPT: 'ACCEPT',
  REJECT: 'REJECT',
  START_PREPARING: 'START_PREPARING',
  START_PACKING: 'START_PACKING',
  MARK_PACKED: 'MARK_PACKED',
  MARK_READY: 'MARK_READY',
  MARK_CUSTOMER_ARRIVED: 'MARK_CUSTOMER_ARRIVED',
  HAND_OVER: 'HAND_OVER',
  COMPLETE: 'COMPLETE',
  CANCEL: 'CANCEL',
  EXPIRE: 'EXPIRE',
  FAIL_PAYMENT: 'FAIL_PAYMENT',
  REQUEST_REFUND: 'REQUEST_REFUND',
  MARK_REFUNDED: 'MARK_REFUNDED',
} as const;

export type OrderEvent = (typeof OrderEvent)[keyof typeof OrderEvent];

/**
 * Who is attempting the transition. Fine-grained staff permissions are enforced
 * by the API's RBAC layer; the state machine only needs the actor class.
 */
export const OrderActor = {
  CUSTOMER: 'CUSTOMER',
  SHOP: 'SHOP',
  SYSTEM: 'SYSTEM',
  ADMIN: 'ADMIN',
} as const;

export type OrderActor = (typeof OrderActor)[keyof typeof OrderActor];
