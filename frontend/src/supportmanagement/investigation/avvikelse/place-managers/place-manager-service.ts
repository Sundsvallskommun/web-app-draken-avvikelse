import { apiService } from '@common/services/api-service';
import { isAxiosError } from 'axios';

/** The places one person holds in AccessMapper, by the place's resource path. */
export interface PlaceManagerAssignment {
  readonly adAccount: string;
  /** How the entry came about: `AUTOMATIC` for the seed's, `MANUAL` for one adjusted by hand. */
  readonly origin: string;
  readonly placePaths: string[];
}

/** One manager role, in the order the BFF sends them. */
export interface PlaceManagerRole {
  readonly key: string;
  readonly label: string;
}

export interface PlaceManagerAssignments {
  readonly assignments: PlaceManagerAssignment[];
  readonly roles: PlaceManagerRole[];
}

export interface PlaceManagerPerson {
  readonly adAccount: string;
  /** Absent when the directory does not know the account. */
  readonly displayName?: string;
  /** The manager roles the person holds. Empty until the AD group that carries one is in place. */
  readonly roleKeys: string[];
}

/** How many accounts the BFF answers for in one lookup. */
const LOOKUP_CHUNK_SIZE = 100;

export const getPlaceManagerAssignments = (municipalityId: string): Promise<PlaceManagerAssignments> =>
  apiService.get<PlaceManagerAssignments>(`supportplacemanagers/${municipalityId}`).then((response) => response.data);

/** Names and manager roles for accounts, asked for as they are shown rather than for everybody up front. */
export const lookupPlaceManagerPeople = async (
  municipalityId: string,
  adAccounts: readonly string[]
): Promise<PlaceManagerPerson[]> => {
  const people: PlaceManagerPerson[] = [];
  for (let start = 0; start < adAccounts.length; start += LOOKUP_CHUNK_SIZE) {
    const body = { adAccounts: adAccounts.slice(start, start + LOOKUP_CHUNK_SIZE) };
    const response = await apiService.post<{ people: PlaceManagerPerson[] }, typeof body>(
      `supportplacemanagers/${municipalityId}/people`,
      body
    );
    people.push(...response.data.people);
  }
  return people;
};

export interface PlaceManagerPlaceChange {
  /** Places to give the person, by label id. An area stands for every unit beneath it. */
  readonly add?: readonly string[];
  /** Places to take from the person, named the same way. */
  readonly remove?: readonly string[];
}

/** Gives a person places or takes them away, and answers with the places the person holds afterwards. */
export const changePlaceManagerPlaces = (
  municipalityId: string,
  adAccount: string,
  change: PlaceManagerPlaceChange
): Promise<PlaceManagerAssignment> => {
  const body = { add: [...(change.add ?? [])], remove: [...(change.remove ?? [])] };
  return apiService
    .put<PlaceManagerAssignment, typeof body>(
      `supportplacemanagers/${municipalityId}/people/${encodeURIComponent(adAccount)}/places`,
      body
    )
    .then((response) => response.data);
};

/** What to tell the administrator when a read or a change fails: that it is not theirs to do, or `fallback`. */
export const placeManagerErrorMessage = (cause: unknown, fallback: string): string =>
  isAxiosError(cause) && [401, 403].includes(cause.response?.status ?? 0)
    ? 'Du saknar behörighet att administrera chefer per plats.'
    : fallback;
