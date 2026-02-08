export type BusinessMode = 'SIMPLE' | 'ADVANCED';

export function getFeatures(mode: BusinessMode) {
  const advanced = mode === 'ADVANCED';
  return {
    advancedReports: advanced,
    advancedOps: advanced
  };
}

export function isAdvancedMode(mode?: BusinessMode | null) {
  return mode === 'ADVANCED';
}
