import { ApiResponse, apiService, Data } from '@common/services/api-service';
import { formatOrgNr, luhnCheck, OrgNumberFormat } from '@common/services/helper-service';

interface CitizenAddressData extends Data {
  personId: string;
  givenname: string;
  lastname: string;
  addresses: {
    realEstateDescription: string;
    co: string;
    address: string;
    addressArea: string;
    addressNumber: string;
    addressLetter: string;
    apartmentNumber: string;
    postalCode: string;
    city: string;
    country: string;
  }[];
}

export interface AddressResult {
  personId: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  street: string;
  careof: string;
  zip: string;
  city: string;
  phone?: string;
  email?: string;
  workPhone?: string;
  error?: string;
  loginName: string;
  company: string;
  administrationCode: string;
  administrationName: string;
  department: string;
  title?: string;
  referenceNumber?: string;
}

const emptyaddress: AddressResult = {
  personId: '',
  firstName: '',
  lastName: '',
  organizationName: '',
  street: '',
  careof: '',
  zip: '',
  city: '',
  loginName: '',
  company: '',
  administrationCode: '',
  administrationName: '',
  department: '',
  title: '',
  referenceNumber: '',
};

interface OrgInfo extends Data {
  errorInformation?: {
    hasErrors: boolean;
    errorDescription?: {
      '-1': string;
    };
  };
  companyName: string;
  legalForm: {
    legalFormDescription: string;
    legalFormCode: string;
  };
  address: {
    city: string;
    street: string;
    postcode?: string;
    careOf: string;
  };
  phoneNumber: string;
  municipality: {
    municipalityName: string;
    municipalityCode: string;
  };
  county: {
    countyName: string;
    countyCode: string;
  };
  fiscalYear: {
    fromDay: number;
    fromMonth: number;
    toDay: number;
    toMonth: number;
  };
  companyForm: {
    companyFormCode: string;
    companyFormDescription: string;
  };
  companyRegistrationTime: string;
  companyLocation?: {
    address: {
      city: string;
      street: string;
      postcode: string;
    };
  };
  businessSignatory: string;
  companyDescription: string;
  sharesInformation: {
    shareTypes: string[];
    numberOfShares: number;
    shareCapital: number;
    shareCurrency: string;
  };
}

interface EmployedPersonData {
  domain: string;
  loginname: string;
  emailAddress: string;
  companyId: number;
}

const isValidPersonalNumber: (ssn: string) => boolean = (ssn) =>
  luhnCheck(ssn) && ((ssn.length === 12 && parseInt(ssn[4]) < 2) || (ssn.length === 10 && parseInt(ssn[2]) < 2));

export const isValidOrgNumber: (ssn: string) => boolean = (ssn) => {
  const nodashed = formatOrgNr(ssn, OrgNumberFormat.NODASH) ?? '';
  const passingLuhn = luhnCheck(nodashed);
  const passingDigitTest = parseInt(nodashed[2]) > 1;
  return passingLuhn && passingDigitTest;
};

export const searchPerson: (ssn: string) => Promise<AddressResult | undefined> = (ssn: string) => {
  ssn = ssn.replace(/\D/g, '');
  return !isValidPersonalNumber(ssn)
    ? Promise.resolve(undefined)
    : apiService
        .post<ApiResponse<CitizenAddressData>, { ssn: string }>('address', { ssn: ssn })
        .then((res) => {
          return res.data.data;
        })
        .then((res) => {
          if (res.error) {
            throw 'Address not found';
          } else {
            const addressItem = res.addresses?.[0];
            return {
              personId: res.personId,
              firstName: res.givenname,
              lastName: res.lastname,
              organizationName: '',
              street: addressItem?.address || '',
              careof: addressItem?.co || '',
              zip: addressItem?.postalCode || '',
              city: addressItem?.city || '',
              loginName: '',
              company: '',
              administrationCode: '',
              administrationName: '',
              department: '',
            } as AddressResult;
          }
        });
};

const parseAdministrationInfo: (orgTree: string) => {
  administrationCode: string;
  administrationName: string;
} = (orgTree) => {
  return {
    administrationCode: orgTree.split('¤')[0].split('|')[1].toString(),
    administrationName: orgTree.split('¤')[0].split('|')[2].toString(),
  };
};

export const searchADUser: (
  username: string,
  domain?: string,
  keepPersonId?: boolean
) => Promise<AddressResult> = async (username: string, domain?: string, keepPersonId?: boolean) => {
  if (!domain) {
    domain = 'PERSONAL';
  }

  return await apiService
    .get<any>(`portalpersondata/${domain}/${username}`)
    .then((res) => {
      return {
        personId: keepPersonId ? res.data.data.personid : undefined,
        firstName: res.data.data.givenname,
        lastName: res.data.data.lastname,
        email: res.data.data.email,
        phone: res.data.data.mobilePhone,
        workPhone: res.data.data.workPhone,
        organizationName: '',
        street: res.data.data.street,
        city: res.data.data.city,
        zip: res.data.data.postalCode,
        careof: res.data.data.careof,
        loginName: username,
        company: res.data.data.company,
        title: res.data.data.title,
        referenceNumber: res.data.data.referenceNumber,
        administrationCode: parseAdministrationInfo(res.data.data.orgTree).administrationCode,
        administrationName: parseAdministrationInfo(res.data.data.orgTree).administrationName,
        department: res.data.data.department,
        // metadata: parseAdministrationInfo(res.data.data.orgTree),
      } as AddressResult;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching AD-user');
      throw e;
    });
};

export const searchADUserByPersonNumber: (personalNumber: string) => Promise<AddressResult | AddressResult[]> = async (
  personalNumber: string
) => {
  personalNumber = personalNumber.replace(/\D/g, '');
  return !isValidPersonalNumber(personalNumber)
    ? Promise.resolve([])
    : await apiService
        .get<ApiResponse<EmployedPersonData[]>>(`employed/${personalNumber}/loginname`)
        .then((res) => res.data.data)
        .then((res) => {
          if (res.length > 1) {
            const promises = res.map((user) => searchADUser(user.loginname, user.domain, true));
            return Promise.all(promises).then((results) => results);
          } else {
            return searchADUser(res[0].loginname, res[0].domain, true);
          }
        });
};
