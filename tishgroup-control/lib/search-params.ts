export type ControlSearchParams = Record<string, string | string[] | undefined>;

export async function resolveSearchParams(
  searchParams?: Promise<ControlSearchParams> | ControlSearchParams
): Promise<ControlSearchParams> {
  if (searchParams && typeof (searchParams as Promise<ControlSearchParams>).then === 'function') {
    return searchParams;
  }

  return searchParams ?? {};
}

export function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
