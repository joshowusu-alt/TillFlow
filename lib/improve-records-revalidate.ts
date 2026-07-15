/**
 * Revalidate the Home / Improve Your Records payload after record changes.
 */
import { revalidatePath } from 'next/cache';

export function revalidateImproveRecordsHome() {
  revalidatePath('/onboarding');
}
