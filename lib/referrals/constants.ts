/** Referral source keys stored on ControlBusinessProfile.referralSource */
export const REFERRAL_SOURCES = [
  'DIRECT_OUTREACH',
  'WHATSAPP_GROUP',
  'EXISTING_CUSTOMER',
  'AGENT_REFERRAL',
  'CHURCH_COMMUNITY',
  'FAMILY_FRIEND',
  'SOCIAL_MEDIA',
  'INVESTOR',
  'WEBSITE',
  'OTHER',
] as const;

export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

export const REFERRAL_SOURCE_LABELS: Record<ReferralSource, string> = {
  DIRECT_OUTREACH: 'Direct outreach',
  WHATSAPP_GROUP: 'WhatsApp group',
  EXISTING_CUSTOMER: 'Existing customer',
  AGENT_REFERRAL: 'Agent referral',
  CHURCH_COMMUNITY: 'Church / community',
  FAMILY_FRIEND: 'Family / friend referral',
  SOCIAL_MEDIA: 'Social media',
  INVESTOR: 'Investor introduction',
  WEBSITE: 'Website',
  OTHER: 'Other',
};

export const REFERRAL_STATUSES = [
  'NEW_LEAD',
  'DEMO_REQUESTED',
  'DEMO_BOOKED',
  'DEMO_COMPLETED',
  'TRIAL_STARTED',
  'ONBOARDED',
  'PAID',
  'NOT_INTERESTED',
  'FOLLOW_UP_LATER',
] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  NEW_LEAD: 'New lead',
  DEMO_REQUESTED: 'Demo requested',
  DEMO_BOOKED: 'Demo booked',
  DEMO_COMPLETED: 'Demo completed',
  TRIAL_STARTED: 'Trial started',
  ONBOARDED: 'Onboarded',
  PAID: 'Paid',
  NOT_INTERESTED: 'Not interested',
  FOLLOW_UP_LATER: 'Follow up later',
};

export const SOURCE_CHANNELS = ['INBOUND', 'OUTBOUND', 'PARTNER', 'EVENT', 'OTHER'] as const;

export const SOURCE_CHANNEL_LABELS: Record<(typeof SOURCE_CHANNELS)[number], string> = {
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
  PARTNER: 'Partner',
  EVENT: 'Event / fair',
  OTHER: 'Other',
};

export function labelReferralSource(value: string | null | undefined) {
  if (!value) return '—';
  return REFERRAL_SOURCE_LABELS[value as ReferralSource] ?? value.replace(/_/g, ' ');
}

export function labelReferralStatus(value: string | null | undefined) {
  if (!value) return '—';
  return REFERRAL_STATUS_LABELS[value as ReferralStatus] ?? value.replace(/_/g, ' ');
}

export function labelSourceChannel(value: string | null | undefined) {
  if (!value) return '—';
  return SOURCE_CHANNEL_LABELS[value as (typeof SOURCE_CHANNELS)[number]] ?? value;
}

export function isDemoReferralStatus(status: string | null | undefined) {
  return status === 'DEMO_REQUESTED' || status === 'DEMO_BOOKED' || status === 'DEMO_COMPLETED';
}
