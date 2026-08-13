import { Permission, ROLE_PERMISSIONS, UserRole } from './enums';

describe('role permissions', () => {
  it('gives every role at least order visibility', () => {
    for (const role of Object.values(UserRole)) {
      expect(ROLE_PERMISSIONS[role]).toContain(Permission.ORDER_READ);
    }
  });

  it('keeps platform management out of shop roles', () => {
    const shopRoles = [UserRole.SHOP_OWNER, UserRole.BRANCH_MANAGER, UserRole.STAFF];
    for (const role of shopRoles) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(Permission.PLATFORM_MANAGE);
    }
    expect(ROLE_PERMISSIONS[UserRole.PLATFORM_ADMIN]).toEqual(
      expect.arrayContaining(Object.values(Permission)),
    );
  });

  it('does not let non-owner staff manage staff or branches', () => {
    expect(ROLE_PERMISSIONS[UserRole.BRANCH_MANAGER]).not.toContain(Permission.STAFF_MANAGE);
    expect(ROLE_PERMISSIONS[UserRole.STAFF]).not.toContain(Permission.INVENTORY_WRITE);
    expect(ROLE_PERMISSIONS[UserRole.SHOP_OWNER]).toContain(Permission.STAFF_MANAGE);
  });
});
