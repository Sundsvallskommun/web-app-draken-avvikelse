import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { resolveSupportManagementApiTarget, SupportManagementApiTarget } from '@/config/api-config';
import {
  IafVofInvestigationClassificationPolicy,
  resolveIafVofInvestigationClassificationPolicy,
} from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE, SupportInvestigationProfile } from '@/config/support-investigation-profile';
import {
  SupportInvestigationRuntimeProfileDto,
  SupportInvestigationState,
  SupportManagementLabelFilterProfileDto,
} from '@/dtos/support-investigation-profile.dto';

export type SupportErrandClassificationOwner = 'generic-errand' | 'investigation' | 'unavailable';
export type SupportRegistrationState = 'enabled' | 'unavailable';

/**
 * The states the investigation can be in at runtime. The profile is always configured, so the contract's
 * `inactive` - an application without an investigation - is never one of them.
 */
type SupportInvestigationRuntimeState = Exclude<SupportInvestigationState, 'inactive'>;

/**
 * Owns whether the configured investigation profile is effective at runtime.
 * `unavailable` means the deployment cannot serve it: protected writes must
 * fail closed while unrelated errand fields can still be saved.
 */
export class SupportInvestigationPolicyService {
  private readonly configuredProfile: SupportInvestigationProfile;
  private readonly namespace: string | undefined;
  private readonly supportManagementApiTarget: SupportManagementApiTarget;
  private readonly resolvedIafVofClassificationPolicy: IafVofInvestigationClassificationPolicy | undefined;

  constructor(
    configuredProfile: SupportInvestigationProfile = AVVIKELSE_INVESTIGATION_PROFILE,
    namespace = SUPPORTMANAGEMENT_NAMESPACE,
    supportManagementApiTarget = resolveSupportManagementApiTarget(),
  ) {
    this.configuredProfile = configuredProfile;
    this.namespace = namespace;
    this.supportManagementApiTarget = supportManagementApiTarget;
    this.resolvedIafVofClassificationPolicy = resolveIafVofInvestigationClassificationPolicy(configuredProfile);
  }

  /**
   * The investigation is active wherever the deployment can serve it: a namespace to keep its documents in,
   * on the Support Management API the profile is built against.
   */
  async getState(): Promise<SupportInvestigationRuntimeState> {
    if (!this.namespace?.trim()) return 'unavailable';
    if (
      this.configuredProfile.requiredSupportManagementApiTarget &&
      this.configuredProfile.requiredSupportManagementApiTarget !== this.supportManagementApiTarget
    ) {
      return 'unavailable';
    }
    return 'active';
  }

  async getRuntimeProfile(): Promise<SupportInvestigationRuntimeProfileDto> {
    const state = await this.getState();
    const registrationState = this.registrationStateForInvestigationState(state);
    return Object.freeze({
      documents: this.configuredProfile.documents,
      ...(this.configuredProfile.labelFilter ? { labelFilter: this.configuredProfile.labelFilter } : {}),
      ...(this.configuredProfile.reportDocument ? { reportDocument: this.configuredProfile.reportDocument } : {}),
      state,
      registration: Object.freeze({
        mode: registrationState === 'enabled' ? 'enabled' : 'disabled',
        // Registration always asks the handler what happened and where before the errand is created.
        form: true,
      }),
    });
  }

  async getClassificationOwner(): Promise<SupportErrandClassificationOwner> {
    if (!this.resolvedIafVofClassificationPolicy) return 'generic-errand';
    return (await this.getState()) === 'active' ? 'investigation' : 'unavailable';
  }

  /**
   * An unavailable policy would create an errand that neither the generic nor the investigation
   * command can finish classifying, so registration fails closed before creating it.
   */
  async getRegistrationState(): Promise<SupportRegistrationState> {
    return this.registrationStateForInvestigationState(await this.getState());
  }

  get profile(): SupportInvestigationProfile {
    return this.configuredProfile;
  }

  get iafVofClassificationPolicy(): IafVofInvestigationClassificationPolicy | undefined {
    return this.resolvedIafVofClassificationPolicy;
  }

  get labelFilter(): SupportManagementLabelFilterProfileDto | undefined {
    return this.configuredProfile.labelFilter;
  }

  get handlerParameters(): SupportInvestigationProfile['handlerParameters'] {
    return this.configuredProfile.handlerParameters;
  }

  get assigneeFollowsErrand(): boolean {
    return this.configuredProfile.assigneeFollowsErrand === true;
  }

  private registrationStateForInvestigationState(state: SupportInvestigationRuntimeState): SupportRegistrationState {
    return this.resolvedIafVofClassificationPolicy && state === 'unavailable' ? 'unavailable' : 'enabled';
  }
}
