import { AVVIKELSE_INVESTIGATION_PROFILE, createSupportInvestigationProfile } from '@/config/support-investigation-profile';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';

const profile = createSupportInvestigationProfile({
  documents: [{ key: 'investigation', schemaName: 'shared-schema', tabLabel: 'Investigation', ownerLabel: 'Owner' }],
});

/** A profile with the two owner documents the fixed IAF/VOF classification rule resolves. */
const classifyingProfile = createSupportInvestigationProfile({
  documents: [
    { key: 'manager-document', schemaName: 'utredning-enhetschef', tabLabel: 'Manager', ownerLabel: 'Manager' },
    { key: 'social-document', schemaName: 'utredning-sol-lss', tabLabel: 'Social', ownerLabel: 'Investigator' },
  ],
  labelFilter: {
    groups: [
      {
        key: 'future-filter',
        label: 'Future filter',
        rootResourcePath: 'FUTURE',
        fields: [{ key: 'future-field', label: 'Future field', classification: 'FUTURE' }],
      },
    ],
  },
});

describe('SupportInvestigationPolicyService', () => {
  it('is active wherever the deployment has a namespace for it', async () => {
    await expect(new SupportInvestigationPolicyService(profile, 'support').getState()).resolves.toBe('active');
  });

  it.each(['', '  '])('is unavailable without a namespace (%j)', async namespace => {
    await expect(new SupportInvestigationPolicyService(profile, namespace).getState()).resolves.toBe('unavailable');
  });

  it('activates the avvikelse investigation on its declared Support Management API target', async () => {
    const service = new SupportInvestigationPolicyService(AVVIKELSE_INVESTIGATION_PROFILE, 'HEALTHCAREDEVIATIONVOF', 'sprint');

    await expect(service.getState()).resolves.toBe('active');
    await expect(service.getRegistrationState()).resolves.toBe('enabled');
    await expect(service.getRuntimeProfile()).resolves.toMatchObject({ state: 'active', registration: { mode: 'enabled', form: true } });
  });

  it('fails the avvikelse investigation closed on a Support Management API target it is not built against', async () => {
    const service = new SupportInvestigationPolicyService(AVVIKELSE_INVESTIGATION_PROFILE, 'support', 'stable');

    await expect(service.getState()).resolves.toBe('unavailable');
    await expect(service.getRegistrationState()).resolves.toBe('unavailable');
    await expect(service.getClassificationOwner()).resolves.toBe('unavailable');
    await expect(service.getRuntimeProfile()).resolves.toMatchObject({
      state: 'unavailable',
      registration: { mode: 'disabled', form: true },
    });
  });

  it('returns the configured profile together with its effective state', async () => {
    const service = new SupportInvestigationPolicyService(profile, 'support');
    await expect(service.getRuntimeProfile()).resolves.toEqual({
      ...profile,
      state: 'active',
      registration: { mode: 'enabled', form: true },
    });
  });

  it('never names the deployment in the runtime profile', async () => {
    const runtime = await new SupportInvestigationPolicyService(AVVIKELSE_INVESTIGATION_PROFILE, 'support', 'sprint').getRuntimeProfile();
    expect(runtime).not.toHaveProperty('application');
  });

  it('keeps user grants out of the application-wide profile', async () => {
    const runtime = await new SupportInvestigationPolicyService(profile, 'support').getRuntimeProfile();
    expect(runtime.documents).toEqual(profile.documents);
    expect(runtime.documents[0]).not.toHaveProperty('access');
  });

  it('moves classification ownership to the investigation with the fixed owner schema roles', async () => {
    const service = new SupportInvestigationPolicyService(classifyingProfile, 'support');

    await expect(service.getClassificationOwner()).resolves.toBe('investigation');
    await expect(new SupportInvestigationPolicyService(classifyingProfile, '').getClassificationOwner()).resolves.toBe('unavailable');
    const runtimeProfile = await service.getRuntimeProfile();
    expect(runtimeProfile).toMatchObject({
      labelFilter: {
        groups: [{ key: 'future-filter', rootResourcePath: 'FUTURE' }],
      },
    });
    expect('classificationPolicy' in runtimeProfile).toBe(false);
  });

  it('leaves classification with the generic errand for a profile without the owner documents', async () => {
    const service = new SupportInvestigationPolicyService(profile, 'support');

    await expect(service.getClassificationOwner()).resolves.toBe('generic-errand');
    expect(service.iafVofClassificationPolicy).toBeUndefined();
    expect(service.labelFilter).toBeUndefined();
  });

  it('keeps registration enabled while the policy is unavailable when no classification has to be finished', async () => {
    await expect(new SupportInvestigationPolicyService(profile, '').getRegistrationState()).resolves.toBe('enabled');
  });
});
