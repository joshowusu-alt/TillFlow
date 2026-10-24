import { isRedirectError } from 'next/dist/client/components/redirect-error';

/** Redirected server actions must reach Next's redirect handler, not failure UI. */
export function classificationSaveFailure(error: unknown): string {
  if (isRedirectError(error)) throw error;
  return 'Could not save. Please try again.';
}
