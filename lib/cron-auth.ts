type HeaderReader = {
  get(name: string): string | null;
};

type RequestLike = {
  headers: HeaderReader;
};

export function getCronSecretsFromHeaders(headers: HeaderReader) {
  const authorization = headers.get('authorization')?.trim() ?? '';
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const bearerSecret = bearerMatch?.[1]?.trim() ?? '';
  const headerSecret = headers.get('x-cron-secret')?.trim() ?? '';

  return {
    bearerSecret,
    headerSecret,
  };
}

export function hasValidCronSecret(request: RequestLike, expectedSecret = process.env.CRON_SECRET) {
  if (!expectedSecret) {
    return false;
  }

  const { bearerSecret, headerSecret } = getCronSecretsFromHeaders(request.headers);
  return bearerSecret === expectedSecret || headerSecret === expectedSecret;
}
