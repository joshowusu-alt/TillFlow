import { revalidateTag } from 'next/cache';

export function revalidateOwnerDashboardCache() {
  revalidateTag('owner-dashboard');
}
