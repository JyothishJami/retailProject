/** Injection token for the shared `pg` pool. Kept separate from the module so
 * importing the token never bootstraps configuration. */
export const PG_POOL = 'PG_POOL';
