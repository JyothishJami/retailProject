/**
 * The authorization catalogue (docs §29, §46). Permissions — not roles — are
 * what handlers check (ADR-11), so adding a role is a data change here plus a
 * seed run, never an edit to a guard.
 *
 * These constants are the single source of truth: the `role` / `permission` /
 * `role_permission` tables are seeded from them, and a drift test fails if the
 * database and this file disagree.
 */

export const Permission = {
  ORDER_READ: 'order.read',
  ORDER_CREATE: 'order.create',
  ORDER_ACCEPT: 'order.accept',
  ORDER_REJECT: 'order.reject',
  ORDER_PACK: 'order.pack',
  ORDER_READY: 'order.ready',
  ORDER_HANDOVER: 'order.handover',
  ORDER_CANCEL: 'order.cancel',
  ORDER_FORCE_CANCEL: 'order.force_cancel',

  PRODUCT_WRITE: 'product.write',
  INVENTORY_WRITE: 'inventory.write',

  BRANCH_WRITE: 'branch.write',
  BUSINESS_WRITE: 'business.write',
  STAFF_MANAGE: 'staff.manage',

  MESSAGE_SEND: 'message.send',
  /** Reading message *bodies*, as opposed to conversation metadata. */
  MESSAGE_READ_CONTENT: 'message.read_content',

  BUSINESS_APPROVE: 'business.approve',
  USER_BLOCK: 'user.block',
  CONFIG_WRITE: 'config.write',
  METRICS_READ: 'metrics.read',
  AUDIT_READ: 'audit.read',
  MASTER_CATALOG_WRITE: 'master_catalog.write',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const RoleScope = {
  PLATFORM: 'PLATFORM',
  BUSINESS: 'BUSINESS',
  BRANCH: 'BRANCH',
} as const;
export type RoleScope = (typeof RoleScope)[keyof typeof RoleScope];

export const RoleCode = {
  CUSTOMER: 'CUSTOMER',

  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  PACKER: 'PACKER',
  CASHIER: 'CASHIER',
  STAFF: 'STAFF',

  SUPER_ADMIN: 'SUPER_ADMIN',
  OPERATIONS_ADMIN: 'OPERATIONS_ADMIN',
  SUPPORT_ADMIN: 'SUPPORT_ADMIN',
  MODERATOR: 'MODERATOR',
  ANALYST: 'ANALYST',
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export interface RoleDefinition {
  readonly code: RoleCode;
  readonly name: string;
  /**
   * The narrowest scope a grant of this role may carry. A `BRANCH` role
   * granted without a branch id is a bug, not a wildcard.
   */
  readonly scopeType: RoleScope;
  readonly permissions: readonly Permission[];
}

const P = Permission;

const SHOP_FLOOR = [P.ORDER_READ, P.MESSAGE_SEND, P.MESSAGE_READ_CONTENT] as const;

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    code: RoleCode.CUSTOMER,
    name: 'Customer',
    scopeType: RoleScope.PLATFORM,
    permissions: [
      P.ORDER_READ,
      P.ORDER_CREATE,
      P.ORDER_CANCEL,
      P.MESSAGE_SEND,
      P.MESSAGE_READ_CONTENT,
    ],
  },
  {
    code: RoleCode.OWNER,
    name: 'Business owner',
    scopeType: RoleScope.BUSINESS,
    permissions: [
      ...SHOP_FLOOR,
      P.ORDER_ACCEPT,
      P.ORDER_REJECT,
      P.ORDER_PACK,
      P.ORDER_READY,
      P.ORDER_HANDOVER,
      P.PRODUCT_WRITE,
      P.INVENTORY_WRITE,
      P.BRANCH_WRITE,
      P.BUSINESS_WRITE,
      P.STAFF_MANAGE,
    ],
  },
  {
    code: RoleCode.MANAGER,
    name: 'Branch manager',
    scopeType: RoleScope.BRANCH,
    permissions: [
      ...SHOP_FLOOR,
      P.ORDER_ACCEPT,
      P.ORDER_REJECT,
      P.ORDER_PACK,
      P.ORDER_READY,
      P.ORDER_HANDOVER,
      P.PRODUCT_WRITE,
      P.INVENTORY_WRITE,
      P.STAFF_MANAGE,
    ],
  },
  {
    // Packs and marks ready; deliberately cannot accept an order (that is a
    // commercial commitment) or hand one over (that is money changing hands).
    code: RoleCode.PACKER,
    name: 'Packer',
    scopeType: RoleScope.BRANCH,
    permissions: [...SHOP_FLOOR, P.ORDER_PACK, P.ORDER_READY, P.INVENTORY_WRITE],
  },
  {
    code: RoleCode.CASHIER,
    name: 'Cashier',
    scopeType: RoleScope.BRANCH,
    permissions: [...SHOP_FLOOR, P.ORDER_HANDOVER],
  },
  {
    code: RoleCode.STAFF,
    name: 'Staff',
    scopeType: RoleScope.BRANCH,
    permissions: [...SHOP_FLOOR],
  },
  {
    code: RoleCode.SUPER_ADMIN,
    name: 'Super admin',
    scopeType: RoleScope.PLATFORM,
    permissions: Object.values(P),
  },
  {
    code: RoleCode.OPERATIONS_ADMIN,
    name: 'Operations admin',
    scopeType: RoleScope.PLATFORM,
    permissions: [
      P.ORDER_READ,
      P.ORDER_FORCE_CANCEL,
      P.BUSINESS_APPROVE,
      P.USER_BLOCK,
      P.CONFIG_WRITE,
      P.METRICS_READ,
      P.AUDIT_READ,
      P.MASTER_CATALOG_WRITE,
    ],
  },
  {
    // Support sees that a conversation exists and what state an order is in;
    // reading message bodies is a separate, audited permission.
    code: RoleCode.SUPPORT_ADMIN,
    name: 'Support admin',
    scopeType: RoleScope.PLATFORM,
    permissions: [P.ORDER_READ, P.METRICS_READ],
  },
  {
    code: RoleCode.MODERATOR,
    name: 'Moderator',
    scopeType: RoleScope.PLATFORM,
    permissions: [P.ORDER_READ, P.MESSAGE_READ_CONTENT, P.AUDIT_READ],
  },
  {
    code: RoleCode.ANALYST,
    name: 'Analyst',
    scopeType: RoleScope.PLATFORM,
    permissions: [P.METRICS_READ],
  },
];

export const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly Permission[]>> =
  Object.fromEntries(ROLE_DEFINITIONS.map((role) => [role.code, role.permissions])) as Record<
    RoleCode,
    readonly Permission[]
  >;

export const ROLE_SCOPES: Readonly<Record<RoleCode, RoleScope>> = Object.fromEntries(
  ROLE_DEFINITIONS.map((role) => [role.code, role.scopeType]),
) as Record<RoleCode, RoleScope>;

/** Roles whose grants are meaningless without the matching scope id. */
export function requiredScopeIdFor(role: RoleCode): 'businessId' | 'branchId' | null {
  switch (ROLE_SCOPES[role]) {
    case RoleScope.BUSINESS:
      return 'businessId';
    case RoleScope.BRANCH:
      return 'branchId';
    default:
      return null;
  }
}
