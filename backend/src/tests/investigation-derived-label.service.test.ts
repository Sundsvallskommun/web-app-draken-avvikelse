import type { Label } from '@/data-contracts/supportmanagement/data-contracts';
import { InvestigationDerivedLabelService } from '@/services/investigation-derived-label.service';

import { mockUser } from './helpers/http';
import { mockMunicipalityId, mockSupportErrandId } from './helpers/mock-data';

const labelStructure: Label[] = [
  {
    id: 'risk-root',
    classification: 'RISK',
    resourceName: 'RISK',
    resourcePath: 'RISK',
    labels: [{ id: 'high-hsl', classification: 'RISK', resourceName: 'HIGH_HSL', resourcePath: 'RISK/HIGH_HSL', labels: [] }],
  },
  {
    id: 'analysis-root',
    classification: 'ANALYSIS',
    resourceName: 'ANALYSIS',
    resourcePath: 'ANALYSIS',
    labels: [{ id: 'hsl-started', classification: 'ANALYSIS', resourceName: 'HSL_STARTED', resourcePath: 'ANALYSIS/HSL_STARTED', labels: [] }],
  },
];

const setup = (errandVersion: number, labels: { id: string }[] = []) => {
  const api = {
    get: vi.fn(async (config: { url: string }) =>
      config.url.endsWith('/metadata/labels')
        ? { data: { labelStructure } }
        : { data: { id: mockSupportErrandId, labels }, headers: { etag: `"${errandVersion}"` } },
    ),
    patch: vi.fn(async () => ({ data: {} })),
  };
  const service = new InvestigationDerivedLabelService(api as never, 'NAMESPACE');
  const apply = (resourcePath = 'RISK/HIGH_HSL') =>
    service.applyDerivedLabel({
      municipalityId: mockMunicipalityId,
      errandId: mockSupportErrandId,
      user: mockUser(),
      resourcePath,
    });
  return { api, apply };
};

describe('InvestigationDerivedLabelService', () => {
  // The label is added to the labels as they are read, whoever set them, and the write is conditioned on the version
  // that read found - not on one the investigation write is supposed to have left.
  it('adds the label to the labels as they are read, conditioned on the version that read found', async () => {
    const { api, apply } = setup(11, [{ id: 'somebody-elses' }]);

    await expect(apply()).resolves.toBe(true);
    expect(api.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { labels: [{ id: 'somebody-elses' }, { id: 'risk-root' }, { id: 'high-hsl' }] },
        headers: { 'If-Match': '"11"' },
      }),
      expect.anything(),
    );
  });

  // The subscription profiles on these labels are how MAS/MAR and the head of operations hear of the errand, so no
  // label write is silent.
  it.each(['RISK/HIGH_HSL', 'ANALYSIS/HSL_STARTED'])('notifies as usual when it adds %s', async resourcePath => {
    const { api, apply } = setup(8);

    await expect(apply(resourcePath)).resolves.toBe(true);
    const [config] = api.patch.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(config).not.toHaveProperty('notifySubscribers');
  });

  // Somebody wrote between the read and the label: the label waits for the next save rather than racing them.
  it('leaves the label for the next save when a write lands between the read and the label', async () => {
    const { api, apply } = setup(8);
    api.patch.mockRejectedValue({ status: 412, message: 'Precondition Failed' });

    await expect(apply()).resolves.toBe(false);
  });

  it('writes nothing when the errand already carries the label', async () => {
    const { api, apply } = setup(8, [{ id: 'risk-root' }, { id: 'high-hsl' }]);

    await expect(apply()).resolves.toBe(false);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('writes nothing for a label the namespace has not configured', async () => {
    const { api, apply } = setup(8);

    await expect(apply('ANALYSIS/NOT_CONFIGURED')).resolves.toBe(false);
    expect(api.patch).not.toHaveBeenCalled();
  });
});
