import { useCallback, useEffect, useRef, useState } from 'react';

import { lookupPlaceManagerPeople, type PlaceManagerPerson } from './place-manager-service';

/**
 * Names and manager roles for the accounts on show, asked for once per account and kept while the view is open.
 * They are not in AccessMapper's list of places, so they are read as places are opened rather than for everybody.
 */
export const usePlaceManagerPeople = (municipalityId: string | undefined, adAccounts: readonly string[]) => {
  const [people, setPeople] = useState<ReadonlyMap<string, PlaceManagerPerson>>(new Map());
  const [failed, setFailed] = useState(false);
  // What has been asked for, so that an answer on its way is not asked for again.
  const requested = useRef(new Set<string>());

  const remember = useCallback((found: readonly PlaceManagerPerson[]) => {
    found.forEach((person) => requested.current.add(person.adAccount.toLowerCase()));
    setPeople(
      (current) => new Map([...current, ...found.map((person) => [person.adAccount.toLowerCase(), person] as const)])
    );
  }, []);

  useEffect(() => {
    const missing = adAccounts.filter((account) => !requested.current.has(account.toLowerCase()));
    if (!municipalityId || missing.length === 0) return;

    missing.forEach((account) => requested.current.add(account.toLowerCase()));
    lookupPlaceManagerPeople(municipalityId, missing).then(
      (found) => {
        setFailed(false);
        remember(found);
      },
      () => {
        // Asked for again the next time the accounts are shown.
        missing.forEach((account) => requested.current.delete(account.toLowerCase()));
        setFailed(true);
      }
    );
  }, [municipalityId, adAccounts, remember]);

  return { people, failed, remember };
};
