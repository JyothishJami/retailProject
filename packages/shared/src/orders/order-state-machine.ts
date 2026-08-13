import { DomainError, ErrorCode } from '../errors/error-codes';

import { OrderActor, OrderEvent, OrderStatus, TERMINAL_ORDER_STATUSES } from './order-status';

export class OrderTransitionError extends DomainError {}

export interface TransitionRule {
  /** Status the order ends up in when the event is applied. */
  readonly to: OrderStatus;
  /** Statuses the event may be applied from. */
  readonly from: readonly OrderStatus[];
  /** Actor classes allowed to raise the event. */
  readonly actors: readonly OrderActor[];
  /**
   * Narrower `from` sets for specific actors. A customer may abandon an order
   * only before the shop starts packing, while an admin may cancel later.
   */
  readonly actorFrom?: Partial<Record<OrderActor, readonly OrderStatus[]>>;
}

const S = OrderStatus;
const A = OrderActor;

/**
 * The single source of truth for the order lifecycle (ADR-5). Server services
 * and both mobile apps import this table, so a client can grey out an action
 * without duplicating — and drifting from — the server's rules.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderEvent, TransitionRule>> = {
  [OrderEvent.PLACE]: { to: S.ORDER_PLACED, from: [S.CART], actors: [A.CUSTOMER] },
  [OrderEvent.MARK_RECEIVED]: {
    to: S.RECEIVED,
    from: [S.ORDER_PLACED],
    actors: [A.SHOP, A.SYSTEM],
  },
  [OrderEvent.ACCEPT]: { to: S.ACCEPTED, from: [S.ORDER_PLACED, S.RECEIVED], actors: [A.SHOP] },
  [OrderEvent.REJECT]: {
    to: S.REJECTED,
    from: [S.ORDER_PLACED, S.RECEIVED],
    actors: [A.SHOP, A.ADMIN],
  },
  [OrderEvent.START_PREPARING]: { to: S.PREPARING, from: [S.ACCEPTED], actors: [A.SHOP] },
  [OrderEvent.START_PACKING]: { to: S.PACKING, from: [S.ACCEPTED, S.PREPARING], actors: [A.SHOP] },
  [OrderEvent.MARK_PACKED]: { to: S.PACKED, from: [S.PACKING], actors: [A.SHOP] },
  [OrderEvent.MARK_READY]: { to: S.READY_FOR_PICKUP, from: [S.PACKED], actors: [A.SHOP] },
  [OrderEvent.MARK_CUSTOMER_ARRIVED]: {
    to: S.CUSTOMER_ARRIVED,
    from: [S.READY_FOR_PICKUP],
    actors: [A.CUSTOMER, A.SHOP],
  },
  [OrderEvent.HAND_OVER]: {
    to: S.HANDED_OVER,
    from: [S.READY_FOR_PICKUP, S.CUSTOMER_ARRIVED],
    actors: [A.SHOP],
  },
  [OrderEvent.COMPLETE]: { to: S.COMPLETED, from: [S.HANDED_OVER], actors: [A.SHOP, A.SYSTEM] },
  [OrderEvent.CANCEL]: {
    to: S.CANCELLED,
    from: [
      S.ORDER_PLACED,
      S.RECEIVED,
      S.ACCEPTED,
      S.PREPARING,
      S.PACKING,
      S.PACKED,
      S.READY_FOR_PICKUP,
      S.CUSTOMER_ARRIVED,
    ],
    actors: [A.CUSTOMER, A.SHOP, A.ADMIN],
    actorFrom: {
      // Once packing starts the shop has committed stock, so the customer must
      // ask the shop (or support) to cancel instead of self-serving.
      [A.CUSTOMER]: [S.ORDER_PLACED, S.RECEIVED, S.ACCEPTED, S.PREPARING],
    },
  },
  [OrderEvent.EXPIRE]: {
    to: S.EXPIRED,
    from: [S.ORDER_PLACED, S.RECEIVED, S.READY_FOR_PICKUP],
    actors: [A.SYSTEM],
  },
  [OrderEvent.FAIL_PAYMENT]: {
    to: S.PAYMENT_FAILED,
    from: [S.ORDER_PLACED, S.HANDED_OVER],
    actors: [A.SYSTEM],
  },
  // Refunds are raised before the order completes; a post-completion refund is a
  // support workflow that reopens the order rather than a lifecycle transition.
  [OrderEvent.REQUEST_REFUND]: {
    to: S.REFUND_PENDING,
    from: [S.PAYMENT_FAILED, S.HANDED_OVER],
    actors: [A.SHOP, A.ADMIN, A.SYSTEM],
  },
  [OrderEvent.MARK_REFUNDED]: {
    to: S.REFUNDED,
    from: [S.REFUND_PENDING],
    actors: [A.SYSTEM, A.ADMIN],
  },
};

export interface OrderStateSnapshot {
  readonly id?: string;
  readonly status: OrderStatus;
}

export interface TransitionContext {
  /** Injected by callers so history rows and tests use a deterministic clock. */
  readonly now?: Date;
  readonly reason?: string;
  readonly actorUserId?: string;
}

export interface TransitionResult {
  readonly fromStatus: OrderStatus;
  readonly toStatus: OrderStatus;
  readonly event: OrderEvent;
  readonly actor: OrderActor;
  readonly occurredAt: Date;
  readonly reason?: string;
  readonly actorUserId?: string;
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

function ruleFor(event: OrderEvent): TransitionRule {
  const rule = ORDER_TRANSITIONS[event];
  if (!rule) {
    throw new OrderTransitionError(
      ErrorCode.ORDER_INVALID_TRANSITION,
      `Unknown order event "${event}".`,
    );
  }
  return rule;
}

function allowedFrom(rule: TransitionRule, actor: OrderActor): readonly OrderStatus[] {
  return rule.actorFrom?.[actor] ?? rule.from;
}

/** True when `actor` may apply `event` to an order currently in `status`. */
export function canApplyOrderEvent(
  status: OrderStatus,
  event: OrderEvent,
  actor: OrderActor,
): boolean {
  const rule = ORDER_TRANSITIONS[event];
  if (!rule || isTerminalOrderStatus(status) || !rule.actors.includes(actor)) {
    return false;
  }
  return allowedFrom(rule, actor).includes(status);
}

/** Events the given actor may raise right now — used to drive client UI affordances. */
export function allowedOrderEvents(status: OrderStatus, actor: OrderActor): OrderEvent[] {
  return (Object.keys(ORDER_TRANSITIONS) as OrderEvent[]).filter((event) =>
    canApplyOrderEvent(status, event, actor),
  );
}

/**
 * Validate and compute a transition. Callers must persist the resulting status
 * plus an `order_status_history` row inside the same transaction that locked the
 * order row; this function is pure and never performs I/O.
 *
 * @throws OrderTransitionError when the order is terminal, the actor is not
 * permitted, or the event is illegal from the current status.
 */
export function applyOrderEvent(
  order: OrderStateSnapshot,
  event: OrderEvent,
  actor: OrderActor,
  context: TransitionContext = {},
): TransitionResult {
  const rule = ruleFor(event);

  if (isTerminalOrderStatus(order.status)) {
    throw new OrderTransitionError(
      ErrorCode.ORDER_ALREADY_TERMINAL,
      `Order is already in terminal status ${order.status}.`,
    );
  }

  if (!rule.actors.includes(actor)) {
    throw new OrderTransitionError(
      ErrorCode.ORDER_ACTOR_NOT_PERMITTED,
      `${actor} may not raise ${event}.`,
    );
  }

  const from = allowedFrom(rule, actor);
  if (!from.includes(order.status)) {
    throw new OrderTransitionError(
      ErrorCode.ORDER_INVALID_TRANSITION,
      `Cannot apply ${event} to an order in status ${order.status}.`,
      [{ field: 'status', issue: `expected one of: ${from.join(', ')}` }],
    );
  }

  const result: TransitionResult = {
    fromStatus: order.status,
    toStatus: rule.to,
    event,
    actor,
    occurredAt: context.now ?? new Date(),
    ...(context.reason === undefined ? {} : { reason: context.reason }),
    ...(context.actorUserId === undefined ? {} : { actorUserId: context.actorUserId }),
  };
  return result;
}
