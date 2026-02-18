export type CollectionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'TIMEOUT';

export type CollectionNetwork = 'MTN' | 'TELECEL' | 'AIRTELTIGO' | 'UNKNOWN';

export type ProviderCollectionRecord = {
  id: string;
  provider: string;
  network: string;
  payerMsisdn: string;
  amountPence: number;
  currency: string;
  idempotencyKey: string;
  providerRequestId: string | null;
  providerTransactionId: string | null;
  providerReference: string | null;
  status: string;
  salesInvoiceId: string | null;
  lastCheckedAt?: Date | string | null;
};

export type InitiateCollectionInput = {
  businessId: string;
  collectionId: string;
  externalId: string;
  idempotencyKey: string;
  amountPence: number;
  currency: string;
  payerMsisdn: string;
  network: CollectionNetwork;
  payerMessage?: string;
  payeeNote?: string;
};

export type InitiateCollectionResult = {
  status: CollectionStatus;
  providerStatus: string;
  providerRequestId?: string | null;
  providerTransactionId?: string | null;
  providerReference?: string | null;
  failureReason?: string | null;
  rawPayload?: unknown;
};

export type CheckStatusInput = {
  businessId: string;
  collection: ProviderCollectionRecord;
};

export type CheckStatusResult = {
  status: CollectionStatus;
  providerStatus: string;
  providerTransactionId?: string | null;
  providerReference?: string | null;
  failureReason?: string | null;
  rawPayload?: unknown;
};

export type ProviderWebhookEvent = {
  providerRequestId?: string | null;
  providerTransactionId?: string | null;
  providerReference?: string | null;
  externalId?: string | null;
  status: CollectionStatus;
  providerStatus: string;
  failureReason?: string | null;
  rawPayload?: unknown;
};

export type HandleWebhookInput = {
  body: unknown;
  headers: Record<string, string>;
};

export type ReconcileInput = {
  businessId: string;
  collections: ProviderCollectionRecord[];
};

export type ReconcileResult = Array<{
  collectionId: string;
  status: CollectionStatus;
  providerStatus: string;
  failureReason?: string | null;
}>;

export interface MobileMoneyProvider {
  readonly key: string;
  initiateCollection(input: InitiateCollectionInput): Promise<InitiateCollectionResult>;
  checkStatus(input: CheckStatusInput): Promise<CheckStatusResult>;
  handleWebhook(input: HandleWebhookInput): Promise<ProviderWebhookEvent[]>;
  reconcile(input: ReconcileInput): Promise<ReconcileResult>;
}
