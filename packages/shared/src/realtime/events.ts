import type { OrderEvent, OrderStatus } from '../orders/order-status';

/**
 * Socket.IO room names. Rooms are the authorization boundary: membership is
 * granted once at connection/subscribe time after a REST-equivalent access check.
 */
export const rooms = {
  order: (orderId: string) => `order:${orderId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  branchOrders: (branchId: string) => `branch:${branchId}:orders`,
  user: (userId: string) => `user:${userId}`,
} as const;

export const SocketEvent = {
  ORDER_STATUS_CHANGED: 'order.status_changed',
  ORDER_ETA_UPDATED: 'order.eta_updated',
  ORDER_CREATED: 'order.created',
  MESSAGE_CREATED: 'message.created',
  MESSAGE_READ: 'message.read',
  TYPING: 'conversation.typing',
} as const;
export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent];

/**
 * Every realtime frame is an envelope: `eventId` lets clients de-duplicate
 * at-least-once deliveries and `version` lets old app builds skip frames they
 * cannot interpret. REST remains the source of truth (ADR-9).
 */
export interface SocketEnvelope<TType extends SocketEvent, TPayload> {
  eventId: string;
  type: TType;
  version: 1;
  occurredAt: string;
  payload: TPayload;
}

export type OrderStatusChangedEvent = SocketEnvelope<
  typeof SocketEvent.ORDER_STATUS_CHANGED,
  {
    orderId: string;
    branchId: string;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    event: OrderEvent;
    readyEtaAt: string | null;
  }
>;

export type MessageCreatedEvent = SocketEnvelope<
  typeof SocketEvent.MESSAGE_CREATED,
  {
    conversationId: string;
    messageId: string;
    clientMessageId: string | null;
    senderUserId: string | null;
    body: string | null;
    mediaIds: string[];
    createdAt: string;
  }
>;
