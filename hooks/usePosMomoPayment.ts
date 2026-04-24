'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  useMomoCollection,
  type CollectionNetwork,
  type MomoCollectionState,
} from '@/hooks/useMomoCollection';
import { getEnabledPosPaymentMethods, getMomoManualGuidance } from '@/lib/payments/pos-momo';

export type { CollectionNetwork, MomoCollectionState };

type PosMomoSnapshot = {
  momoPaid: string;
  momoRef: string;
  momoPayerMsisdn: string;
  momoNetwork: CollectionNetwork;
  momoCollectionId: string;
  momoCollectionStatus: MomoCollectionState;
  momoCollectionError: string | null;
  momoIdempotencyKey: string;
  momoCollectionSignature: string;
};

type UsePosMomoPaymentOptions = {
  storeId: string;
  momoEnabled: boolean;
  momoProvider?: string | null;
};

export function usePosMomoPayment({
  storeId,
  momoEnabled,
  momoProvider,
}: UsePosMomoPaymentOptions) {
  const {
    momoPaid,
    setMomoPaid,
    momoRef,
    setMomoRef,
    momoPayerMsisdn,
    setMomoPayerMsisdn,
    momoNetwork,
    setMomoNetwork,
    momoCollectionId,
    setMomoCollectionId,
    momoCollectionStatus,
    setMomoCollectionStatus,
    momoCollectionError,
    setMomoCollectionError,
    momoIdempotencyKey,
    setMomoIdempotencyKey,
    momoCollectionSignature,
    setMomoCollectionSignature,
    isInitiatingMomo,
    resetMomoCollection,
    handleInitiateMomoCollection,
  } = useMomoCollection({ storeId });

  const availablePaymentMethods = useMemo(
    () => getEnabledPosPaymentMethods(momoEnabled),
    [momoEnabled]
  );
  const momoGuidance = useMemo(
    () => getMomoManualGuidance(momoProvider),
    [momoProvider]
  );

  const resetMomoPaymentFields = useCallback(() => {
    setMomoPaid('');
    setMomoPayerMsisdn('');
    setMomoNetwork('MTN');
    resetMomoCollection();
  }, [resetMomoCollection, setMomoNetwork, setMomoPaid, setMomoPayerMsisdn]);

  const restoreMomoSnapshot = useCallback((snapshot: PosMomoSnapshot) => {
    setMomoPaid(snapshot.momoPaid);
    setMomoRef(snapshot.momoRef);
    setMomoPayerMsisdn(snapshot.momoPayerMsisdn);
    setMomoNetwork(snapshot.momoNetwork);
    setMomoCollectionId(snapshot.momoCollectionId);
    setMomoCollectionStatus(snapshot.momoCollectionStatus);
    setMomoCollectionError(snapshot.momoCollectionError);
    setMomoIdempotencyKey(snapshot.momoIdempotencyKey);
    setMomoCollectionSignature(snapshot.momoCollectionSignature);
  }, [
    setMomoCollectionError,
    setMomoCollectionId,
    setMomoCollectionSignature,
    setMomoCollectionStatus,
    setMomoIdempotencyKey,
    setMomoNetwork,
    setMomoPaid,
    setMomoPayerMsisdn,
    setMomoRef,
  ]);

  return {
    availablePaymentMethods,
    momoGuidance,
    momoPaid,
    setMomoPaid,
    momoRef,
    setMomoRef,
    momoPayerMsisdn,
    setMomoPayerMsisdn,
    momoNetwork,
    setMomoNetwork,
    momoCollectionId,
    momoCollectionStatus,
    momoCollectionError,
    momoIdempotencyKey,
    momoCollectionSignature,
    isInitiatingMomo,
    resetMomoCollection,
    resetMomoPaymentFields,
    restoreMomoSnapshot,
    handleInitiateMomoCollection,
  };
}

type UseStalePosMomoCollectionResetOptions = {
  momoCollectionId: string;
  momoCollectionStatus: MomoCollectionState;
  momoCollectionSignature: string;
  momoSignature: string;
  needsMomoConfirmation: boolean;
  resetMomoCollection: () => void;
};

export function useStalePosMomoCollectionReset({
  momoCollectionId,
  momoCollectionStatus,
  momoCollectionSignature,
  momoSignature,
  needsMomoConfirmation,
  resetMomoCollection,
}: UseStalePosMomoCollectionResetOptions) {
  useEffect(() => {
    if (!momoCollectionId) return;
    if (momoCollectionStatus === 'PENDING') return;
    if (momoCollectionSignature && momoCollectionSignature !== momoSignature) {
      resetMomoCollection();
    }
  }, [
    momoCollectionId,
    momoCollectionSignature,
    momoCollectionStatus,
    momoSignature,
    resetMomoCollection,
  ]);

  useEffect(() => {
    if (needsMomoConfirmation) return;
    if (!momoCollectionId && momoCollectionStatus === 'IDLE') return;
    resetMomoCollection();
  }, [momoCollectionId, momoCollectionStatus, needsMomoConfirmation, resetMomoCollection]);
}
