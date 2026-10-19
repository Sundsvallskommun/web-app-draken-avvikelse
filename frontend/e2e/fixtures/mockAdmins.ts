/** The handler roles the BFF answers with the handler list, as `HEALTHCAREDEVIATION_HANDLER_ROLES` names them. */
export const mockHandlerRoles = [
  { key: 'enhetschef', label: 'Enhetschef' },
  { key: 'verksamhetschef', label: 'Verksamhetschef' },
  { key: 'lex-ansvarig', label: 'LEX-ansvarig' },
  { key: 'lex-utredare', label: 'LEX-utredare' },
  { key: 'mas-mar', label: 'MAS/MAR' },
];

export const mockAdmins = {
  data: [
    {
      displayName: 'Testhandläggare Katarina',
      name: 'TESTADMIN1',
      guid: '6678-fe-fr43w-f-dew',
      roleKeys: ['enhetschef'],
    },
    {
      displayName: 'Testhandläggare Gunilla',
      name: 'TESTADMIN2',
      guid: 'r3d3-d3-f3qf3qd-3qd32d23-d',
      roleKeys: ['lex-ansvarig'],
    },
    {
      displayName: 'My Testsson',
      name: 'kctest',
      guid: 'r2d6-d3-f3qf4zk-3qd32p55-l',
      roleKeys: ['enhetschef'],
    },
  ],
  roles: mockHandlerRoles,
  message: 'ok',
};

/** A handler directory with nobody in the role groups, for the pages that never show it. */
export const mockNoAdmins = { data: [], roles: mockHandlerRoles, message: 'ok' };
