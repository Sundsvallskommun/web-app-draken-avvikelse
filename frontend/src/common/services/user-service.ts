import { User } from '@common/interfaces/user';

import { ApiResponse, apiService } from './api-service';

export const emptyUser: User = {
  name: '',
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  permissions: {
    canEditSupportManagement: false,
  },
  roleKeys: [],
};

const handleSetUserResponse = (res: ApiResponse<User>): User => ({
  name: res.data.name,
  email: res.data.email,
  username: res.data.username,
  firstName: res.data.firstName,
  lastName: res.data.lastName,
  permissions: res.data.permissions,
  roleKeys: res.data.roleKeys,
  superadmin: res.data.superadmin === true,
});

export const getMe: () => Promise<User> = () => {
  return apiService
    .get<ApiResponse<User>>('me')
    .then((res) => handleSetUserResponse(res.data))
    .catch((err) => {
      return Promise.reject(err.response?.data?.message);
    });
};

interface AdUser {
  description: string;
  displayName: string;
  domain: string;
  guid: string;
  isLinked: string;
  name: string;
  ouPath: string;
  personId: string;
  schemaClassName: string;
  roleKeys: string[];
  /** Present when giving this person the errand is a named investigation handover. */
  handoverStep?: string;
}

export interface Admin {
  displayName: string;
  firstName: string;
  lastName: string;
  adAccount: string;
  id: string;
  /** The handler roles this account holds; the selector lists the account under each of them. */
  roleKeys: string[];
  /**
   * The named investigation handover that giving this person the errand is - the handover to LEX, say - rather
   * than an ordinary change of handler. Only the errand's own handler list sets it.
   */
  handoverStep?: string;
}

/** One handler role. Presentation only - who may be assigned what is decided in the backend. */
export interface HandlerRole {
  key: string;
  label: string;
}

export interface HandlerDirectory {
  administrators: Admin[];
  /** The handler roles in the deployment's order, which the selector groups the handlers by. */
  roles: HandlerRole[];
}

/** All the BFF tells about an employee. */
interface EmployeeNameResponse {
  name: string | null;
}

interface HandlerDirectoryResponse extends ApiResponse<AdUser[]> {
  roles: HandlerRole[];
}

const toHandlerDirectory = (body: HandlerDirectoryResponse): HandlerDirectory => ({
  administrators: body.data.map((u) => ({
    displayName: u.displayName,
    firstName: u.displayName.split(' ')[1],
    lastName: u.displayName.split(' ')[0],
    adAccount: u.name,
    id: u.guid,
    roleKeys: u.roleKeys,
    ...(u.handoverStep ? { handoverStep: u.handoverStep } : {}),
  })),
  roles: body.roles,
});

export const getHandlerDirectory: () => Promise<HandlerDirectory> = () => {
  return apiService
    .get<HandlerDirectoryResponse>(`users/admins`)
    .then((res) => toHandlerDirectory(res.data))
    .catch((err) => {
      return Promise.reject(err.response?.data?.message);
    });
};

export const getNameFromADUsername: (username: string, admins: Admin[]) => string | undefined = (username, admins) => {
  const admin = admins.find((a) => a.adAccount === username);
  return admin ? `${admin.firstName} ${admin.lastName}` : undefined;
};

export const getInitialsFromADUsername: (username: string, admins: Admin[]) => string | undefined = (
  username,
  admins
) => {
  const admin = admins.find((a) => a.adAccount === username);
  return admin ? `${admin.firstName[0]}${admin.lastName[0]}` : undefined;
};

/** An employee's name from the Employee API, or null when it holds none for the account. */
export const getEmployeeName: (adAccount: string) => Promise<string | null> = (adAccount) => {
  return apiService
    .get<ApiResponse<EmployeeNameResponse>>(`user/${encodeURIComponent(adAccount)}`)
    .then((res) => {
      return res.data.data?.name || null;
    })
    .catch((err) => {
      return Promise.reject(err.response?.data?.message);
    });
};

/**
 * The handlers who can be assigned one specific errand.
 *
 * The ordinary handler directory is the same for every errand, so it keeps offering people who can
 * no longer reach the one in front of you. This asks per errand instead, and a deployment with
 * nothing to filter by simply gets the same list back.
 */
export const getAssignableHandlers: (errandId: string) => Promise<HandlerDirectory> = (errandId) =>
  apiService
    .get<HandlerDirectoryResponse>(`supporterrands/${errandId}/assignable-handlers`)
    .then((res) => toHandlerDirectory(res.data));
