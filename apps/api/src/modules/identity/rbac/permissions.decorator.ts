import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@quickpick/shared';

export const PUBLIC_METADATA_KEY = 'quickpick:public';
export const PERMISSIONS_METADATA_KEY = 'quickpick:permissions';

/** Opts a route out of authentication. Everything else requires a bearer token. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_METADATA_KEY, true);

/**
 * Declares the permissions a route needs. The guard can only check that the
 * caller holds them *somewhere*; a handler touching a specific business or
 * branch must still call `AccessService.assertCan` with the scope it read off
 * the loaded resource.
 */
export const RequirePermissions = (
  ...permissions: readonly Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
