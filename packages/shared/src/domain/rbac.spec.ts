import {
  Permission,
  ROLE_DEFINITIONS,
  ROLE_PERMISSIONS,
  ROLE_SCOPES,
  RoleCode,
  RoleScope,
  requiredScopeIdFor,
} from './rbac';

describe('rbac catalogue', () => {
  it('defines every role exactly once', () => {
    const codes = ROLE_DEFINITIONS.map((role) => role.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(codes)).toEqual(new Set(Object.values(RoleCode)));
  });

  it('grants no permission outside the catalogue', () => {
    const known = new Set<string>(Object.values(Permission));
    for (const role of ROLE_DEFINITIONS) {
      for (const permission of role.permissions) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it('never repeats a permission within a role', () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it('keeps platform-only powers out of shop and customer roles', () => {
    const platformOnly = [
      Permission.BUSINESS_APPROVE,
      Permission.USER_BLOCK,
      Permission.CONFIG_WRITE,
      Permission.AUDIT_READ,
      Permission.ORDER_FORCE_CANCEL,
      Permission.MASTER_CATALOG_WRITE,
    ];
    const nonPlatformRoles = ROLE_DEFINITIONS.filter(
      (role) => role.scopeType !== RoleScope.PLATFORM,
    );
    expect(nonPlatformRoles.length).toBeGreaterThan(0);
    for (const role of nonPlatformRoles) {
      for (const permission of platformOnly) {
        expect(role.permissions).not.toContain(permission);
      }
    }
  });

  it('lets a customer place orders but not fulfil them', () => {
    const customer = ROLE_PERMISSIONS[RoleCode.CUSTOMER];
    expect(customer).toContain(Permission.ORDER_CREATE);
    expect(customer).not.toContain(Permission.ORDER_ACCEPT);
    expect(customer).not.toContain(Permission.ORDER_HANDOVER);
  });

  it('separates packing from accepting and handing over', () => {
    const packer = ROLE_PERMISSIONS[RoleCode.PACKER];
    expect(packer).toContain(Permission.ORDER_PACK);
    expect(packer).not.toContain(Permission.ORDER_ACCEPT);
    expect(packer).not.toContain(Permission.ORDER_HANDOVER);

    const cashier = ROLE_PERMISSIONS[RoleCode.CASHIER];
    expect(cashier).toContain(Permission.ORDER_HANDOVER);
    expect(cashier).not.toContain(Permission.INVENTORY_WRITE);
  });

  it('gives the super admin the whole catalogue', () => {
    expect(new Set(ROLE_PERMISSIONS[RoleCode.SUPER_ADMIN])).toEqual(
      new Set(Object.values(Permission)),
    );
  });

  it('withholds message bodies from support but not from moderation', () => {
    expect(ROLE_PERMISSIONS[RoleCode.SUPPORT_ADMIN]).not.toContain(Permission.MESSAGE_READ_CONTENT);
    expect(ROLE_PERMISSIONS[RoleCode.MODERATOR]).toContain(Permission.MESSAGE_READ_CONTENT);
  });

  it('requires a scope id for every non-platform role', () => {
    for (const role of Object.values(RoleCode)) {
      const expected =
        ROLE_SCOPES[role] === RoleScope.BUSINESS
          ? 'businessId'
          : ROLE_SCOPES[role] === RoleScope.BRANCH
            ? 'branchId'
            : null;
      expect(requiredScopeIdFor(role)).toBe(expected);
    }
  });

  it('scopes shop roles to a business or branch, never to the platform', () => {
    for (const role of [RoleCode.OWNER, RoleCode.MANAGER, RoleCode.PACKER, RoleCode.CASHIER]) {
      expect(ROLE_SCOPES[role]).not.toBe(RoleScope.PLATFORM);
    }
    expect(ROLE_SCOPES[RoleCode.OWNER]).toBe(RoleScope.BUSINESS);
    expect(ROLE_SCOPES[RoleCode.MANAGER]).toBe(RoleScope.BRANCH);
  });
});
