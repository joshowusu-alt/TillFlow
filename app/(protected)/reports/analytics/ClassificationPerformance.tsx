import { getClassificationSalesReport } from '@/lib/reports/classification-sales';
import ClassificationDisclosure from '@/components/reports/ClassificationDisclosure';
import ClassificationPerformanceClient from './ClassificationPerformanceClient';

export default async function ClassificationPerformance({ businessId, currency, start, end, storeIds }: {
  businessId: string; currency: string; start: Date; end: Date; storeIds: readonly string[];
}) {
  const data = await getClassificationSalesReport(businessId, { start, end, storeIds });
  return <ClassificationDisclosure><ClassificationPerformanceClient {...data} currency={currency} /></ClassificationDisclosure>;
}
