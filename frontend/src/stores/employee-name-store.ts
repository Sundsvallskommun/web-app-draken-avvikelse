import { getUserInfo } from '@common/services/user-service';
import { create } from 'zustand';

/**
 * Display names for AD accounts that the `users/admins` list cannot answer for.
 *
 * That list only holds the drake's AD admin group, so anyone outside it - a registrar who is not
 * a handler, for instance - resolves to no name at all there. This store fills the gap from the
 * Employee API, one account at a time, and keeps the answers for the life of the session.
 *
 * A resolved account maps to its name; an account the API had nothing for maps to `null`, which
 * is remembered so a miss is never retried in a render loop.
 */
interface EmployeeNameState {
  /** Keyed by lowercased AD account, because AD casing and session usernames disagree. */
  names: Record<string, string | null>;
}

interface EmployeeNameActions {
  /** Looks up every account not already resolved or in flight. Safe to call on every render. */
  resolveNames: (accounts: readonly (string | undefined)[]) => void;
  reset: () => void;
}

type EmployeeNameStore = EmployeeNameState & EmployeeNameActions;

const initialState: EmployeeNameState = { names: {} };

/**
 * In-flight accounts live outside the store on purpose: they are not state anything renders from,
 * and keeping them out means a pending lookup cannot trigger a re-render of every table row.
 */
const inFlightAccounts = new Set<string>();

const formatEmployeeName = (givenname: string | undefined, lastname: string | undefined): string =>
  [givenname, lastname].filter(Boolean).join(' ').trim();

export const useEmployeeNameStore = create<EmployeeNameStore>((set, get) => ({
  ...initialState,

  resolveNames: (accounts) => {
    // Cached and deduplicated by lowercased account, but requested with the casing the errand
    // carries: the Employee API is asked for a path segment, and it is not ours to assume it
    // matches case-insensitively.
    const pending = new Map<string, string>();
    accounts.forEach((account) => {
      if (!account) return;
      const key = account.toLowerCase();
      if (key in get().names || inFlightAccounts.has(key) || pending.has(key)) return;
      pending.set(key, account);
    });

    pending.forEach((account, key) => {
      inFlightAccounts.add(key);
      getUserInfo(account)
        .then((employee) => {
          const name = formatEmployeeName(employee?.givenname, employee?.lastname) || employee?.fullname || '';
          set((state) => ({ names: { ...state.names, [key]: name || null } }));
        })
        .catch(() => {
          // A miss is a real answer: remember it so the row falls back to the raw account for good
          // rather than asking again on every re-render.
          set((state) => ({ names: { ...state.names, [key]: null } }));
        })
        .finally(() => {
          inFlightAccounts.delete(key);
        });
    });
  },

  reset: () => {
    inFlightAccounts.clear();
    set(initialState);
  },
}));
