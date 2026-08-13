import { SocketEvent, rooms } from './events';

describe('realtime contracts', () => {
  it('namespaces rooms per resource so a subscriber cannot wildcard into another', () => {
    expect(rooms.order('o1')).toBe('order:o1');
    expect(rooms.conversation('c1')).toBe('conversation:c1');
    expect(rooms.branchOrders('b1')).toBe('branch:b1:orders');
    expect(rooms.user('u1')).toBe('user:u1');
  });

  it('keeps event names dotted and lowercase so clients can match on prefix', () => {
    for (const name of Object.values(SocketEvent)) {
      expect(name).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    }
  });
});
