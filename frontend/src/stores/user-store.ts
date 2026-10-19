import { User } from '@common/interfaces/user';
import { Admin, emptyUser, HandlerRole } from '@common/services/user-service';
import { create } from 'zustand';

/**
 * Whether the handler directory could be read at all.
 *
 * The directory is published all-or-nothing: one unreachable AD group fails the whole lookup rather
 * than quietly omitting the handlers it holds. Without this state an empty list means two different
 * things - "nobody holds this role" and "the lookup failed" - and a caller offering an assignment
 * would report the first while the second is true.
 */
export type HandlerDirectoryState = 'loading' | 'ready' | 'error';

interface UserState {
  user: User;
  avatar: string;
  administrators: Admin[];
  /** Configured handler roles in display order. Empty when the deployment assigns without roles. */
  handlerRoles: HandlerRole[];
  handlerDirectoryState: HandlerDirectoryState;
}

interface UserActions {
  setUser: (user: User) => void;
  setAvatar: (avatar: string) => void;
  setAdministrators: (admins: Admin[]) => void;
  setHandlerRoles: (roles: HandlerRole[]) => void;
  setHandlerDirectoryState: (state: HandlerDirectoryState) => void;
  reset: () => void;
}

type UserStore = UserState & UserActions;

const initialState: UserState = {
  user: emptyUser,
  avatar: '',
  administrators: [],
  handlerRoles: [],
  handlerDirectoryState: 'loading',
};

export const useUserStore = create<UserStore>((set) => ({
  ...initialState,
  setUser: (user) => set({ user }),
  setAvatar: (avatar) => set({ avatar }),
  setAdministrators: (administrators) => set({ administrators }),
  setHandlerRoles: (handlerRoles) => set({ handlerRoles }),
  setHandlerDirectoryState: (handlerDirectoryState) => set({ handlerDirectoryState }),
  reset: () => set(initialState),
}));
