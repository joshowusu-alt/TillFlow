import { notFound } from 'next/navigation';
import GuideView from '@/components/guides/GuideView';
import { getGuide } from '@/lib/guides/content';

export default function GuideDetailPage({ params }: { params: { slug: string } }) {
  const guide = getGuide(params.slug);
  if (!guide || guide.audience === 'agent') notFound();
  return <GuideView guide={guide} />;
}
