import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getPublicStorefrontBySlug } from '@/lib/services/online-orders';
import { getStorefrontSessionCustomer } from '@/lib/services/storefront-customers';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  params: { slug: string };
  searchParams?: { redirect?: string | string[] };
};

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  return {
    title: storefront ? `Sign in — ${storefront.name}` : 'Sign in',
    robots: { index: false, follow: false },
  };
}

function readRedirect(value: string | string[] | undefined, slug: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return `/shop/${slug}`;
  if (!raw.startsWith(`/shop/${slug}`)) return `/shop/${slug}`;
  return raw;
}

export default async function StorefrontLoginPage({ params, searchParams }: LoginPageProps) {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  if (!storefront) notFound();

  const redirectTo = readRedirect(searchParams?.redirect, params.slug);
  const existing = await getStorefrontSessionCustomer(params.slug);
  if (existing) {
    redirect(redirectTo);
  }

  return (
    <LoginClient
      slug={params.slug}
      storefrontName={storefront.name}
      branding={storefront.branding}
      redirectTo={redirectTo}
    />
  );
}
