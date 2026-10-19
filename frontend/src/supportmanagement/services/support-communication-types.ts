export const SupportCommunicationType = {
  Email: 'EMAIL',
  Sms: 'SMS',
  WebMessage: 'WEB_MESSAGE',
  Draken: 'DRAKEN',
  MinaSidor: 'MINASIDOR',
} as const;

export type SupportCommunicationType = (typeof SupportCommunicationType)[keyof typeof SupportCommunicationType];

export const isSupportReplyableCommunicationType = (communicationType: SupportCommunicationType): boolean =>
  communicationType === SupportCommunicationType.Email ||
  communicationType === SupportCommunicationType.WebMessage ||
  communicationType === SupportCommunicationType.Draken ||
  communicationType === SupportCommunicationType.MinaSidor;
