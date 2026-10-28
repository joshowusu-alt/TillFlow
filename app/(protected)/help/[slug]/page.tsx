import { notFound } from 'next/navigation';
import GuideView from '@/components/guides/GuideView';
import { getGuide } from '@/lib/guides/content';

export default async function GuideDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const guide = getGuide(params.slug);
  if (!guide || guide.audience === 'agent') notFound();
  return <GuideView guide={guide} />;
}
