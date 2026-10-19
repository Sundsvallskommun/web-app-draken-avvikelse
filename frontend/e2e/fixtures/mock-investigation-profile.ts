/**
 * Boot-time investigation profile for a spec that does not route the profile itself, matching what the BFF
 * returns where no profile is configured: no documents, state "inactive", registration enabled.
 *
 * AppInitializer holds back the first paint until this request settles, so a spec that leaves it
 * unmocked renders nothing until the client timeout expires. Returned from a factory so a spec that
 * overrides parts of it cannot mutate the object the next test gets.
 */
export const mockInvestigationProfile = () => ({
  documents: [],
  state: 'inactive',
  registration: { mode: 'enabled' },
});
