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

export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  SHOP_OWNER: 'SHOP_OWNER',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  STAFF: 'STAFF',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * Permissions are the unit of authorization (ADR-11); roles are bundles of
 * permissions so that a new role never requires touching guard code.
 */
export const Permission = {
  ORDER_READ: 'order:read',
  ORDER_TRANSITION: 'order:transition',
  CATALOG_WRITE: 'catalog:write',
  INVENTORY_WRITE: 'inventory:write',
  BRANCH_WRITE: 'branch:write',
  STAFF_MANAGE: 'staff:manage',
  CHAT_WRITE: 'chat:write',
  PLATFORM_MANAGE: 'platform:manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  [UserRole.CUSTOMER]: [Permission.ORDER_READ, Permission.ORDER_TRANSITION, Permission.CHAT_WRITE],
  [UserRole.SHOP_OWNER]: [
    Permission.ORDER_READ,
    Permission.ORDER_TRANSITION,
    Permission.CATALOG_WRITE,
    Permission.INVENTORY_WRITE,
    Permission.BRANCH_WRITE,
    Permission.STAFF_MANAGE,
    Permission.CHAT_WRITE,
  ],
  [UserRole.BRANCH_MANAGER]: [
    Permission.ORDER_READ,
    Permission.ORDER_TRANSITION,
    Permission.CATALOG_WRITE,
    Permission.INVENTORY_WRITE,
    Permission.CHAT_WRITE,
  ],
  [UserRole.STAFF]: [Permission.ORDER_READ, Permission.ORDER_TRANSITION, Permission.CHAT_WRITE],
  [UserRole.PLATFORM_ADMIN]: Object.values(Permission),
};

export const PaymentMode = {
  PAY_AT_STORE: 'PAY_AT_STORE',
  ONLINE: 'ONLINE',
} as const;
export type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];
