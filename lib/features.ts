export type BusinessMode = 'SIMPLE' | 'ADVANCED';
export type StoreMode = 'SINGLE_STORE' | 'MULTI_STORE';

export function getFeatures(mode: BusinessMode, storeMode?: StoreMode) {
  const advanced = mode === 'ADVANCED';
  const multi = storeMode === 'MULTI_STORE';
  return {
    advancedReports: advanced,
    advancedOps: advanced,
    multiStore: multi,
  };
}

export function isAdvancedMode(mode?: BusinessMode | null) {
  return mode === 'ADVANCED';
}
