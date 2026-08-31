export const RELIABILITY_PREVIEW_QA_TAG = 'RELIABILITY_PREVIEW_QA';
export const RELIABILITY_PREVIEW_QA_BUSINESS_NAME = 'Reliability Preview QA';
export const RELIABILITY_PREVIEW_QA_OWNER_NAME = 'Reliability QA Owner';

/**
 * QA tagging is Preview-only. Production never honors a requested tag.
 * This does not change authentication or password handling.
 */
export function resolveRegisterQaTag(input: {
  vercelEnv?: string | null;
  requestedTag?: string | null;
}) {
  if (input.vercelEnv === 'production') return undefined;
  if (input.vercelEnv !== 'preview') return undefined;
  if (input.requestedTag === RELIABILITY_PREVIEW_QA_TAG) return RELIABILITY_PREVIEW_QA_TAG;
  return undefined;
}
