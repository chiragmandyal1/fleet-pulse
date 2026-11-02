export const ROLES = ['admin', 'customer', 'viewer'] as const;

/**
 * admin    — every customer's devices, and may edit them.
 * customer — read-only, and only the devices of its own customer.
 * viewer   — read-only across every customer (a NOC operator's seat).
 */
export type Role = (typeof ROLES)[number];

/** Who is making the request. Built from the verified JWT, never from the body. */
export interface AuthUser {
  email: string;
  role: Role;
  /** Set only for the customer role. */
  customerId?: string;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  customerId?: string;
}
