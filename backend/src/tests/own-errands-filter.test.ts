import { ownHandlerParameterKeys } from '@/services/own-errands-filter';

const handlerRoles = [
  { key: 'mas-mar', label: 'MAS/MAR', group: 'MOCK_MAS_MAR' },
  { key: 'enhetschef', label: 'Enhetschef', group: 'MOCK_UNIT_MANAGERS' },
];
const handlerParameters = [{ key: 'masMarHandler', roleKey: 'mas-mar' }];
const masMar = { username: 'Mia.Mas', groups: ['mock_mas_mar'] };

describe('ownHandlerParameterKeys', () => {
  it('widens Mina ärenden to the parameters naming a role the user holds', () => {
    expect(ownHandlerParameterKeys('mia.mas', masMar, handlerParameters, handlerRoles)).toEqual(['masMarHandler']);
  });

  it("leaves somebody else's errands, and a user without the role, as they were", () => {
    expect(ownHandlerParameterKeys('someone.else', masMar, handlerParameters, handlerRoles)).toBeUndefined();
    expect(
      ownHandlerParameterKeys('nora.chef', { username: 'nora.chef', groups: ['MOCK_UNIT_MANAGERS'] }, handlerParameters, handlerRoles),
    ).toBeUndefined();
    expect(ownHandlerParameterKeys(undefined, masMar, handlerParameters, handlerRoles)).toBeUndefined();
  });

  it('changes nothing where the profile names no handler parameters', () => {
    expect(ownHandlerParameterKeys('mia.mas', masMar, undefined, handlerRoles)).toBeUndefined();
  });
});
