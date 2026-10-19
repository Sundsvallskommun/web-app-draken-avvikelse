import { MUNICIPALITY_ID } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { Employeev2, EmploymentV2, PortalPersonData } from '@/data-contracts/employee/data-contracts';
import { User } from '@/interfaces/users.interface';

import ApiService from './api.service';

const mainEmploymentFirst = (first: EmploymentV2, second: EmploymentV2): number =>
  Number(Boolean(second.isMainEmployment)) - Number(Boolean(first.isMainEmployment));

/** Where the signed-in user is employed, as the Employee API holds it. */
export class EmploymentService {
  private apiService = new ApiService();
  private readonly employeeService = apiServiceName('employee');

  /**
   * The user's employments that name their organization unit, main employment first. An account the
   * Employee API does not know as a person has none.
   */
  async readEmployments(user: User): Promise<EmploymentV2[]> {
    const personal = await this.apiService.get<PortalPersonData>(
      { url: `${this.employeeService}/${MUNICIPALITY_ID}/portalpersondata/PERSONAL/${user.username}` },
      user,
    );
    const personId = personal.data?.personid;
    if (!personId) return [];

    const response = await this.apiService.get<Employeev2[]>(
      { url: `${this.employeeService}/${MUNICIPALITY_ID}/employments?PersonId=${personId}` },
      user,
    );
    return (response.data?.[0]?.employments ?? []).filter(employment => employment.orgId && employment.orgName).sort(mainEmploymentFirst);
  }
}
