import { mtnCollectionsProvider } from './mtn-collections';
import type { MobileMoneyProvider } from './types';

const PROVIDERS: Record<string, MobileMoneyProvider> = {
  [mtnCollectionsProvider.key]: mtnCollectionsProvider,
};

export function getMobileMoneyProvider(providerKey: string): MobileMoneyProvider {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`Unsupported mobile money provider: ${providerKey}`);
  }
  return provider;
}

export function resolveBusinessProvider(providerValue: string | null | undefined): MobileMoneyProvider {
  const normalized = (providerValue ?? '').trim().toUpperCase();

  if (normalized === 'MTN' || normalized === 'MTN_COLLECTIONS' || normalized === '') {
    return mtnCollectionsProvider;
  }

  if (normalized === 'TELECEL' || normalized === 'AIRTELTIGO') {
    // Placeholders for future providers; intentionally clear failure for now.
    throw new Error(
      `Provider "${normalized}" is not configured yet. MTN Collections is currently supported.`
    );
  }

  return getMobileMoneyProvider(normalized);
}

export function listMobileMoneyProviders(): MobileMoneyProvider[] {
  return Object.values(PROVIDERS);
}
