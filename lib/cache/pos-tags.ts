import { revalidateTag } from 'next/cache';

/** Shared POS cache tags. Agent E may extend this helper with more writers. */
export function revalidatePosTillShiftTags() {
  revalidateTag('pos-tills');
  revalidateTag('pos-shifts');
}
