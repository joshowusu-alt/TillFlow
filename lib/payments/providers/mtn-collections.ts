import { randomUUID } from 'crypto';
import type {
  CheckStatusInput,
  CheckStatusResult,
  CollectionStatus,
  HandleWebhookInput,
  InitiateCollectionInput,
  InitiateCollectionResult,
  MobileMoneyProvider,
  ProviderWebhookEvent,
  ReconcileInput,
  ReconcileResult,
} from './types';

const DEFAULT_TIMEOUT_MS = 15_000;

type MtnConfig = {
  baseUrl: string;
  userId: string;
  apiKey: string;
  subscriptionKey: string;
  targetEnvironment: string;
  callbackUrl?: string;
};

function shouldUseMockMode(env: NodeJS.ProcessEnv): boolean {
  const explicit = env.MTN_MOMO_COLLECTION_MOCK?.trim().toLowerCase();
  if (explicit === '1' || explicit === 'true' || explicit === 'yes') return true;
  if (explicit === '0' || explicit === 'false' || explicit === 'no') return false;

  const hasRequired =
    Boolean(env.MTN_MOMO_COLLECTION_BASE_URL?.trim()) &&
    Boolean(env.MTN_MOMO_COLLECTION_USER_ID?.trim()) &&
    Boolean(env.MTN_MOMO_COLLECTION_API_KEY?.trim()) &&
    Boolean(env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY?.trim());

  if (!hasRequired && env.NODE_ENV !== 'production') {
    return true;
  }
  return false;
}

function readMtnConfig(): MtnConfig & { mockMode: boolean } {
  const mockMode = shouldUseMockMode(process.env);
  const baseUrl = process.env.MTN_MOMO_COLLECTION_BASE_URL?.trim() ?? '';
  const userId = process.env.MTN_MOMO_COLLECTION_USER_ID?.trim() ?? '';
  const apiKey = process.env.MTN_MOMO_COLLECTION_API_KEY?.trim() ?? '';
  const subscriptionKey = process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY?.trim() ?? '';
  const targetEnvironment =
    process.env.MTN_MOMO_COLLECTION_TARGET_ENV?.trim() || 'sandbox';
  const callbackUrl = process.env.MTN_MOMO_COLLECTION_CALLBACK_URL?.trim() || undefined;

  if (!mockMode && (!baseUrl || !userId || !apiKey || !subscriptionKey)) {
    throw new Error(
      'MTN MoMo credentials are missing. Set MTN_MOMO_COLLECTION_BASE_URL, MTN_MOMO_COLLECTION_USER_ID, MTN_MOMO_COLLECTION_API_KEY, and MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY.'
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    userId,
    apiKey,
    subscriptionKey,
    targetEnvironment,
    callbackUrl,
    mockMode,
  };
}

function mapMtnStatus(status: string | null | undefined): CollectionStatus {
  const normalized = (status ?? '').toUpperCase();
  if (normalized === 'SUCCESSFUL' || normalized === 'SUCCESS' || normalized === 'COMPLETED') {
    return 'CONFIRMED';
  }
  if (normalized === 'FAILED' || normalized === 'REJECTED') return 'FAILED';
  if (normalized === 'TIMEOUT' || normalized === 'EXPIRED') return 'TIMEOUT';
  return 'PENDING';
}

async function requestJson(
  url: string,
  init: RequestInit
): Promise<{ status: number; body: any; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(config: MtnConfig) {
  const basic = Buffer.from(`${config.userId}:${config.apiKey}`).toString('base64');
  const response = await requestJson(`${config.baseUrl}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
    },
  });

  if (response.status < 200 || response.status >= 300 || !response.body?.access_token) {
    throw new Error(
      `MTN token request failed (${response.status}): ${JSON.stringify(response.body)}`
    );
  }
  return response.body.access_token as string;
}

function mockStatus(input: CheckStatusInput): CheckStatusResult {
  const msisdn = input.collection.payerMsisdn ?? '';
  if (msisdn.endsWith('000')) {
    return {
      status: 'FAILED',
      providerStatus: 'MOCK_FAILED',
      failureReason: 'Mock provider rejection',
      rawPayload: { mock: true, reason: 'simulated-failure' },
    };
  }
  if (msisdn.endsWith('999')) {
    return {
      status: 'TIMEOUT',
      providerStatus: 'MOCK_TIMEOUT',
      failureReason: 'Mock provider timeout',
      rawPayload: { mock: true, reason: 'simulated-timeout' },
    };
  }
  if (input.collection.lastCheckedAt) {
    return {
      status: 'CONFIRMED',
      providerStatus: 'MOCK_SUCCESSFUL',
      providerTransactionId: input.collection.providerTransactionId ?? `MOCK-TX-${input.collection.id.slice(-8)}`,
      providerReference: input.collection.providerReference ?? input.collection.id,
      rawPayload: { mock: true, status: 'successful' },
    };
  }
  return {
    status: 'PENDING',
    providerStatus: 'MOCK_PENDING',
    providerReference: input.collection.providerReference ?? input.collection.id,
    rawPayload: { mock: true, status: 'pending' },
  };
}

function extractMtnWebhookEvents(body: any): ProviderWebhookEvent[] {
  const payloads = Array.isArray(body) ? body : [body];
  return payloads
    .filter((payload) => payload && typeof payload === 'object')
    .map((payload) => {
      const status = mapMtnStatus(payload.status);
      return {
        providerRequestId:
          payload.referenceId ??
          payload.requestId ??
          payload.requestToPayId ??
          payload.momoReferenceId ??
          null,
        providerTransactionId:
          payload.financialTransactionId ?? payload.transactionId ?? payload.providerTransactionId ?? null,
        providerReference: payload.externalId ?? payload.reference ?? null,
        externalId: payload.externalId ?? null,
        status,
        providerStatus: String(payload.status ?? 'UNKNOWN'),
        failureReason:
          payload.reason ?? payload.reasonCode ?? (status === 'FAILED' ? 'Provider reported failure' : null),
        rawPayload: payload,
      } satisfies ProviderWebhookEvent;
    });
}

export const mtnCollectionsProvider: MobileMoneyProvider = {
  key: 'MTN_COLLECTIONS',

  async initiateCollection(input: InitiateCollectionInput): Promise<InitiateCollectionResult> {
    const config = readMtnConfig();
    if (config.mockMode) {
      return {
        status: 'PENDING',
        providerStatus: 'MOCK_PENDING',
        providerRequestId: randomUUID(),
        providerReference: input.externalId,
        rawPayload: {
          mock: true,
          message: 'Mock MTN provider accepted request',
          externalId: input.externalId,
        },
      };
    }
    const token = await getAccessToken(config);
    const providerRequestId = randomUUID();
    const body = {
      amount: (input.amountPence / 100).toFixed(2),
      currency: input.currency,
      externalId: input.externalId,
      payer: {
        partyIdType: 'MSISDN',
        partyId: input.payerMsisdn,
      },
      payerMessage: input.payerMessage ?? `Checkout ${input.collectionId}`,
      payeeNote: input.payeeNote ?? 'Supermarket POS payment',
    };

    const response = await requestJson(`${config.baseUrl}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Reference-Id': providerRequestId,
        'X-Target-Environment': config.targetEnvironment,
        'Ocp-Apim-Subscription-Key': config.subscriptionKey,
        ...(config.callbackUrl ? { 'X-Callback-Url': config.callbackUrl } : {}),
      },
      body: JSON.stringify(body),
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        status: 'FAILED',
        providerStatus: `HTTP_${response.status}`,
        providerRequestId,
        failureReason: JSON.stringify(response.body),
        rawPayload: response.body,
      };
    }

    return {
      status: 'PENDING',
      providerStatus: 'PENDING',
      providerRequestId,
      rawPayload: response.body,
    };
  },

  async checkStatus(input: CheckStatusInput): Promise<CheckStatusResult> {
    const config = readMtnConfig();
    if (config.mockMode) {
      return mockStatus(input);
    }
    if (!input.collection.providerRequestId) {
      return {
        status: 'FAILED',
        providerStatus: 'MISSING_PROVIDER_REQUEST_ID',
        failureReason: 'Collection missing provider request identifier.',
      };
    }
    const token = await getAccessToken(config);
    const response = await requestJson(
      `${config.baseUrl}/collection/v1_0/requesttopay/${input.collection.providerRequestId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': config.targetEnvironment,
          'Ocp-Apim-Subscription-Key': config.subscriptionKey,
        },
      }
    );

    if (response.status < 200 || response.status >= 300) {
      return {
        status: 'FAILED',
        providerStatus: `HTTP_${response.status}`,
        failureReason: JSON.stringify(response.body),
        rawPayload: response.body,
      };
    }

    const providerStatus = String(response.body?.status ?? 'UNKNOWN');
    const mapped = mapMtnStatus(providerStatus);
    return {
      status: mapped,
      providerStatus,
      providerTransactionId: response.body?.financialTransactionId ?? null,
      providerReference: response.body?.externalId ?? response.body?.payerMessage ?? null,
      failureReason:
        mapped === 'FAILED' || mapped === 'TIMEOUT'
          ? response.body?.reason ?? response.body?.reasonCode ?? null
          : null,
      rawPayload: response.body,
    };
  },

  async handleWebhook(input: HandleWebhookInput): Promise<ProviderWebhookEvent[]> {
    return extractMtnWebhookEvents(input.body);
  },

  async reconcile(input: ReconcileInput): Promise<ReconcileResult> {
    const results: ReconcileResult = [];
    for (const collection of input.collections) {
      const status = await this.checkStatus({
        businessId: input.businessId,
        collection,
      });
      results.push({
        collectionId: collection.id,
        status: status.status,
        providerStatus: status.providerStatus,
        failureReason: status.failureReason ?? null,
      });
    }
    return results;
  },
};
