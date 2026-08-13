import { ErrorCode } from '../errors/error-codes';

import {
  ORDER_TRANSITIONS,
  OrderTransitionError,
  allowedOrderEvents,
  applyOrderEvent,
  canApplyOrderEvent,
  isTerminalOrderStatus,
} from './order-state-machine';
import { OrderActor, OrderEvent, OrderStatus, TERMINAL_ORDER_STATUSES } from './order-status';

const at = new Date('2026-01-01T10:00:00.000Z');

describe('order state machine', () => {
  describe('happy path', () => {
    it('walks CART → COMPLETED through the documented pickup flow', () => {
      const flow: Array<[OrderEvent, OrderActor, OrderStatus]> = [
        [OrderEvent.PLACE, OrderActor.CUSTOMER, OrderStatus.ORDER_PLACED],
        [OrderEvent.MARK_RECEIVED, OrderActor.SYSTEM, OrderStatus.RECEIVED],
        [OrderEvent.ACCEPT, OrderActor.SHOP, OrderStatus.ACCEPTED],
        [OrderEvent.START_PREPARING, OrderActor.SHOP, OrderStatus.PREPARING],
        [OrderEvent.START_PACKING, OrderActor.SHOP, OrderStatus.PACKING],
        [OrderEvent.MARK_PACKED, OrderActor.SHOP, OrderStatus.PACKED],
        [OrderEvent.MARK_READY, OrderActor.SHOP, OrderStatus.READY_FOR_PICKUP],
        [OrderEvent.MARK_CUSTOMER_ARRIVED, OrderActor.CUSTOMER, OrderStatus.CUSTOMER_ARRIVED],
        [OrderEvent.HAND_OVER, OrderActor.SHOP, OrderStatus.HANDED_OVER],
        [OrderEvent.COMPLETE, OrderActor.SHOP, OrderStatus.COMPLETED],
      ];

      let status: OrderStatus = OrderStatus.CART;
      for (const [event, actor, expected] of flow) {
        const result = applyOrderEvent({ status }, event, actor, { now: at });
        expect(result.fromStatus).toBe(status);
        expect(result.toStatus).toBe(expected);
        expect(result.occurredAt).toEqual(at);
        status = result.toStatus;
      }
      expect(isTerminalOrderStatus(status)).toBe(true);
    });

    it('records the reason and actor when supplied, and omits them otherwise', () => {
      const withContext = applyOrderEvent(
        { id: 'o1', status: OrderStatus.ORDER_PLACED },
        OrderEvent.REJECT,
        OrderActor.SHOP,
        { now: at, reason: 'out of stock', actorUserId: 'u1' },
      );
      expect(withContext).toMatchObject({
        toStatus: OrderStatus.REJECTED,
        reason: 'out of stock',
        actorUserId: 'u1',
      });

      const bare = applyOrderEvent(
        { status: OrderStatus.CART },
        OrderEvent.PLACE,
        OrderActor.CUSTOMER,
      );
      expect(bare).not.toHaveProperty('reason');
      expect(bare).not.toHaveProperty('actorUserId');
      expect(bare.occurredAt.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('guards', () => {
    it('rejects events applied from the wrong status', () => {
      expect(() =>
        applyOrderEvent(
          { status: OrderStatus.ORDER_PLACED },
          OrderEvent.MARK_READY,
          OrderActor.SHOP,
        ),
      ).toThrow(OrderTransitionError);

      try {
        applyOrderEvent({ status: OrderStatus.ACCEPTED }, OrderEvent.MARK_PACKED, OrderActor.SHOP);
        throw new Error('expected a transition error');
      } catch (error) {
        const domainError = error as OrderTransitionError;
        expect(domainError.code).toBe(ErrorCode.ORDER_INVALID_TRANSITION);
        expect(domainError.details).toEqual([
          { field: 'status', issue: 'expected one of: PACKING' },
        ]);
      }
    });

    it('rejects actors that may not raise the event', () => {
      try {
        applyOrderEvent(
          { status: OrderStatus.ORDER_PLACED },
          OrderEvent.ACCEPT,
          OrderActor.CUSTOMER,
        );
        throw new Error('expected a transition error');
      } catch (error) {
        expect((error as OrderTransitionError).code).toBe(ErrorCode.ORDER_ACTOR_NOT_PERMITTED);
      }
    });

    it.each(TERMINAL_ORDER_STATUSES)('rejects any event once %s is reached', (status) => {
      try {
        applyOrderEvent({ status }, OrderEvent.CANCEL, OrderActor.ADMIN);
        throw new Error('expected a transition error');
      } catch (error) {
        expect((error as OrderTransitionError).code).toBe(ErrorCode.ORDER_ALREADY_TERMINAL);
      }
    });

    it('rejects unknown events', () => {
      expect(() =>
        applyOrderEvent({ status: OrderStatus.CART }, 'TELEPORT' as OrderEvent, OrderActor.ADMIN),
      ).toThrow(/Unknown order event/);
    });
  });

  describe('cancellation windows', () => {
    it('lets a customer cancel until preparation but not once packing starts', () => {
      expect(
        canApplyOrderEvent(OrderStatus.PREPARING, OrderEvent.CANCEL, OrderActor.CUSTOMER),
      ).toBe(true);
      expect(canApplyOrderEvent(OrderStatus.PACKING, OrderEvent.CANCEL, OrderActor.CUSTOMER)).toBe(
        false,
      );
    });

    it('lets the shop and admin cancel a packed order', () => {
      expect(canApplyOrderEvent(OrderStatus.PACKED, OrderEvent.CANCEL, OrderActor.SHOP)).toBe(true);
      expect(
        applyOrderEvent({ status: OrderStatus.PACKED }, OrderEvent.CANCEL, OrderActor.ADMIN)
          .toStatus,
      ).toBe(OrderStatus.CANCELLED);
    });

    it('expires only unacknowledged or uncollected orders, and only via the system', () => {
      expect(
        canApplyOrderEvent(OrderStatus.ORDER_PLACED, OrderEvent.EXPIRE, OrderActor.SYSTEM),
      ).toBe(true);
      expect(canApplyOrderEvent(OrderStatus.PREPARING, OrderEvent.EXPIRE, OrderActor.SYSTEM)).toBe(
        false,
      );
      expect(canApplyOrderEvent(OrderStatus.ORDER_PLACED, OrderEvent.EXPIRE, OrderActor.SHOP)).toBe(
        false,
      );
    });
  });

  describe('refunds', () => {
    it('moves a failed payment through refund pending to refunded', () => {
      const pending = applyOrderEvent(
        { status: OrderStatus.PAYMENT_FAILED },
        OrderEvent.REQUEST_REFUND,
        OrderActor.ADMIN,
      );
      expect(pending.toStatus).toBe(OrderStatus.REFUND_PENDING);
      expect(
        applyOrderEvent({ status: pending.toStatus }, OrderEvent.MARK_REFUNDED, OrderActor.SYSTEM)
          .toStatus,
      ).toBe(OrderStatus.REFUNDED);
    });

    it('does not allow a customer to mark their own refund complete', () => {
      expect(
        canApplyOrderEvent(
          OrderStatus.REFUND_PENDING,
          OrderEvent.MARK_REFUNDED,
          OrderActor.CUSTOMER,
        ),
      ).toBe(false);
    });
  });

  describe('allowedOrderEvents', () => {
    it('exposes exactly the actions a shop can take on a placed order', () => {
      expect(allowedOrderEvents(OrderStatus.ORDER_PLACED, OrderActor.SHOP).sort()).toEqual(
        [OrderEvent.MARK_RECEIVED, OrderEvent.ACCEPT, OrderEvent.REJECT, OrderEvent.CANCEL].sort(),
      );
    });

    it('offers a customer nothing but cancellation while the shop prepares', () => {
      expect(allowedOrderEvents(OrderStatus.PREPARING, OrderActor.CUSTOMER)).toEqual([
        OrderEvent.CANCEL,
      ]);
    });

    it('offers nothing from a terminal status', () => {
      for (const actor of Object.values(OrderActor)) {
        expect(allowedOrderEvents(OrderStatus.COMPLETED, actor)).toEqual([]);
      }
    });

    it('returns false for unknown events', () => {
      expect(canApplyOrderEvent(OrderStatus.CART, 'NOPE' as OrderEvent, OrderActor.ADMIN)).toBe(
        false,
      );
    });
  });

  describe('table invariants', () => {
    it('never targets CART and always names at least one source status and actor', () => {
      for (const [event, rule] of Object.entries(ORDER_TRANSITIONS)) {
        expect(rule.to).not.toBe(OrderStatus.CART);
        expect(rule.from.length).toBeGreaterThan(0);
        expect(rule.actors.length).toBeGreaterThan(0);
        expect(rule.from).not.toContain(rule.to);
        for (const [actor, statuses] of Object.entries(rule.actorFrom ?? {})) {
          expect(rule.actors).toContain(actor);
          expect(rule.from).toEqual(expect.arrayContaining([...statuses]));
        }
        expect(event).toBe(event.toUpperCase());
      }
    });

    it('keeps canApplyOrderEvent and applyOrderEvent in agreement everywhere', () => {
      for (const status of Object.values(OrderStatus)) {
        for (const event of Object.values(OrderEvent)) {
          for (const actor of Object.values(OrderActor)) {
            const permitted = canApplyOrderEvent(status, event, actor);
            let applied = true;
            try {
              applyOrderEvent({ status }, event, actor);
            } catch {
              applied = false;
            }
            expect(applied).toBe(permitted);
          }
        }
      }
    });

    it('makes every non-terminal status reachable from CART', () => {
      const reached = new Set<OrderStatus>([OrderStatus.CART]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const rule of Object.values(ORDER_TRANSITIONS)) {
          if (!reached.has(rule.to) && rule.from.some((status) => reached.has(status))) {
            reached.add(rule.to);
            grew = true;
          }
        }
      }
      expect([...Object.values(OrderStatus)].filter((status) => !reached.has(status))).toEqual([]);
    });
  });
});
