// Minimal express request/response doubles for calling controller methods directly.
// routing-controllers' @Req()/@Param()/@Res() decorators are inert outside the framework,
// so controller methods can be invoked as plain functions with these stand-ins.

import { RequestWithUser } from '@/interfaces/auth.interface';
import { Permissions, User } from '@/interfaces/users.interface';

import { mockAdUsername, mockFirstName, mockLastName } from './mock-data';

/** Permissions are named one flag at a time, so a test states only the one it depends on. */
type MockUserOverrides = Partial<Omit<User, 'permissions'>> & { permissions?: Partial<Permissions> };

export const mockUser = ({ permissions, ...overrides }: MockUserOverrides = {}): User =>
  ({
    username: mockAdUsername,
    name: `${mockFirstName} ${mockLastName}`,
    givenName: mockFirstName,
    surname: mockLastName,
    groups: [],
    ...overrides,
    permissions: { ...permissions },
  }) as User;

export const mockReq = (user: User = mockUser()): RequestWithUser => ({ user }) as RequestWithUser;

export interface MockResponse<T = unknown> {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  /** Last status passed to status(); undefined when the handler only called send(). */
  statusCode?: number;
  /** Last payload passed to send(). */
  body?: T;
  /** Headers recorded by setHeader(), keyed exactly as the handler wrote them. */
  headers: Record<string, unknown>;
}

/** Chainable express response double: `status()`, `send()` and `setHeader()` all return the response,
 *  as express does. Read the recorded payload off `res.body` rather than the return value of the handler. */
export const mockRes = <T = unknown>(): MockResponse<T> => {
  const res: MockResponse<T> = {
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    send: vi.fn((body: unknown) => {
      res.body = body as T;
      return res;
    }),
    setHeader: vi.fn((name: string, value: unknown) => {
      res.headers[name] = value;
      return res;
    }),
    headers: {},
  };
  return res;
};

/**
 * The value a controller receives for an absent conditional-write header.
 *
 * These parameters are declared `string` rather than `string | undefined` on purpose: the union
 * reflects `design:type` as `Object`, which makes routing-controllers JSON.parse the header and
 * corrupt it (see the comment above the decorators). At runtime an absent header still arrives as
 * undefined, so tests that exercise the missing-precondition path pass this instead of a raw cast.
 */
export const ABSENT_HEADER = undefined as unknown as string;
