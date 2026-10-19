import type { SupportRegistrationOptions } from '@supportmanagement/services/support-errand-service';

/**
 * The place the form starts from. A place the handler's employment gives is theirs already, the main employment's
 * first; so is the only place their account has. Among several configured places the handler makes the choice.
 */
export const initialRegistrationLocationId = (options: SupportRegistrationOptions): string =>
  options.locationSource === 'employment' || options.locations.length === 1 ? options.locations[0]?.labelId ?? '' : '';

/** Whether the place is settled by the handler's one employment, leaving nothing to choose. */
export const registrationLocationIsFixed = (options: SupportRegistrationOptions): boolean =>
  options.locationSource === 'employment' && options.locations.length === 1;
