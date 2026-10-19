import type { Errand, ErrandNote } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { User } from '@/interfaces/users.interface';

import { assertSupportErrandWritable } from './support-errand.service';

/**
 * Support Management notes carry no type, so Draken tells its kinds of note apart by their context. Comments
 * keep the context Support Management notes have always been written with; service notes (tjänsteanteckningar) get one of
 * their own, and each list asks Support Management for its own context only.
 */
export const SUPPORT_COMMENT = Object.freeze({ context: 'SUPPORT', role: 'FIRST_LINE_SUPPORT', subject: 'Notering' });
export const SUPPORT_SERVICE_NOTE = Object.freeze({ context: 'SERVICE_NOTE', role: 'ERRAND_HANDLER', subject: 'Tjänsteanteckning' });

export const isSupportServiceNote = (note: Pick<ErrandNote, 'context'>): boolean => note.context === SUPPORT_SERVICE_NOTE.context;

/** A service note as Support Management stores it: the handler's record, signed with the handler's name. */
export const buildSupportServiceNote = (body: string, user: Pick<User, 'name'>, partyId?: string) => ({
  context: SUPPORT_SERVICE_NOTE.context,
  role: SUPPORT_SERVICE_NOTE.role,
  ...(partyId ? { partyId } : {}),
  subject: SUPPORT_SERVICE_NOTE.subject,
  body: body.trim(),
  createdBy: user.name,
});

/**
 * A service note is the handler's record of the errand: only the handler the errand is assigned to writes one,
 * and only while the errand accepts writes. AccessMapper grants notes as one resource, so it cannot tell a
 * service note from a comment - this rule has to live here.
 */
export function assertCanWriteSupportServiceNote(errand: Pick<Errand, 'status' | 'assignedUserId'>, user: Pick<User, 'username'>): void {
  assertSupportErrandWritable(errand, 'service notes');
  const handler = errand.assignedUserId?.trim().toLowerCase();
  const writer = user.username?.trim().toLowerCase();
  if (!handler || handler !== writer) throw new HttpException(403, 'Endast ärendets handläggare kan skriva tjänsteanteckningar.');
}

/** A saved service note is a record of the errand, so Draken never changes or removes one. */
export function assertSupportNoteIsChangeable(note: Pick<ErrandNote, 'context'>, operation: 'ändras' | 'tas bort'): void {
  if (isSupportServiceNote(note)) throw new HttpException(403, `En tjänsteanteckning kan inte ${operation}.`);
}
