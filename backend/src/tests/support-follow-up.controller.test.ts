import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SupportFollowUpController, UnitFollowUpQueryDto } from '@/controllers/supportmanagement/support-follow-up.controller';
import type { SupportFollowUpService } from '@/services/support-follow-up.service';

import { mockReq } from './helpers/http';
import { mockMunicipalityId } from './helpers/mock-data';

const makeController = () => {
  const followUp = { read: vi.fn(async () => ({ errands: [], measureTypes: [], truncated: false })) };
  return { controller: new SupportFollowUpController(followUp as unknown as SupportFollowUpService), followUp };
};

describe('SupportFollowUpController', () => {
  it('accepts a period of calendar days and nothing else', async () => {
    const valid = plainToInstance(UnitFollowUpQueryDto, { from: '2025-10-05', to: '2026-10-05' });
    const invalid = plainToInstance(UnitFollowUpQueryDto, { from: '5 okt', to: '' });

    await expect(validate(valid)).resolves.toEqual([]);
    expect(JSON.stringify(await validate(invalid))).toMatch(/from[\s\S]*to/);
  });

  it('reads the units for the period', async () => {
    const { controller, followUp } = makeController();
    const req = mockReq();

    await controller.readUnits(req, mockMunicipalityId, { from: '2025-10-05', to: '2026-10-05' });

    expect(followUp.read).toHaveBeenCalledWith(mockMunicipalityId, { from: '2025-10-05', to: '2026-10-05' }, req.user);
  });

  it('refuses a period that ends before it starts', async () => {
    const { controller, followUp } = makeController();

    await expect(controller.readUnits(mockReq(), mockMunicipalityId, { from: '2026-10-05', to: '2025-10-05' })).rejects.toMatchObject({
      status: 400,
    });
    expect(followUp.read).not.toHaveBeenCalled();
  });
});
