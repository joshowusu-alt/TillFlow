'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  checkMomoCollectionStatusAction,
  initiateMomoCollectionAction,
} from '@/app/actions/mobile-money';
import { parseCurrencyToPence } from '@/lib/payments/pos-checkout';

export type CollectionNetwork = 'MTN' | 'TELECEL' | 'AIRTELTIGO' | 'UNKNOWN';
export type MomoCollectionState = 'IDLE' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'TIMEOUT';

type ApplyMomoStatusInput = {
  status: string;
  providerStatus?: string | null;
  providerReference?: string | null;
  providerTransactionId?: string | null;
  failureReason?: string | null;
};

export function useMomoCollection({ storeId }: { storeId: string }) {
  const [momoPaid, setMomoPaid] = useState('');
  const [momoRef, setMomoRef] = useState('');
  const [momoPayerMsisdn, setMomoPayerMsisdn] = useState('');
  const [momoNetwork, setMomoNetwork] = useState<CollectionNetwork>('MTN');
  const [momoCollectionId, setMomoCollectionId] = useState('');
  const [momoCollectionStatus, setMomoCollectionStatus] = useState<MomoCollectionState>('IDLE');
  const [momoCollectionError, setMomoCollectionError] = useState<string | null>(null);
  const [momoIdempotencyKey, setMomoIdempotencyKey] = useState('');
  const [momoCollectionSignature, setMomoCollectionSignature] = useState('');
  const [isInitiatingMomo, setIsInitiatingMomo] = useState(false);

  const resetMomoCollection = useCallback(() => {
    setMomoCollectionId('');
    setMomoCollectionStatus('IDLE');
    setMomoCollectionError(null);
    setMomoIdempotencyKey('');
    setMomoCollectionSignature('');
    setMomoRef('');
  }, []);

  const applyMomoStatus = useCallback((next: ApplyMomoStatusInput) => {
    const normalized = (next.status || 'IDLE').toUpperCase() as MomoCollectionState;
    setMomoCollectionStatus(normalized);
    const providerRef = next.providerTransactionId ?? next.providerReference ?? '';
    if (providerRef) setMomoRef(providerRef);
    if (normalized === 'FAILED' || normalized === 'TIMEOUT') {
      setMomoCollectionError(
        next.failureReason ||
          `MoMo collection ${normalized.toLowerCase()}. You can retry safely.`
      );
    } else if (normalized === 'CONFIRMED') {
      setMomoCollectionError(null);
    }
  }, []);

  const handleInitiateMomoCollection = useCallback(async () => {
    if (isInitiatingMomo) return;

    const amountPence = Math.max(0, Math.round(parseCurrencyToPence(momoPaid)));
    const payer = momoPayerMsisdn.trim();
    if (amountPence <= 0) {
      setMomoCollectionError('Enter a valid MoMo amount before requesting collection.');
      return;
    }
    if (!payer) {
      setMomoCollectionError('Enter the payer phone number to request collection.');
      return;
    }

    setIsInitiatingMomo(true);
    setMomoCollectionError(null);
    setMomoCollectionStatus('PENDING');

    const nextIdempotencyKey =
      momoIdempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    try {
      const result = await initiateMomoCollectionAction({
        storeId,
        amountPence,
        payerMsisdn: payer,
        network: momoNetwork,
        idempotencyKey: nextIdempotencyKey,
      });

      if (!result.success) {
        setMomoCollectionStatus('FAILED');
        setMomoCollectionError(result.error);
        return;
      }

      setMomoIdempotencyKey(nextIdempotencyKey);
      setMomoCollectionId(result.data.collectionId);
      setMomoCollectionSignature(
        `${amountPence}|${momoNetwork}|${momoPayerMsisdn.trim().replace(/\s+/g, '')}`
      );
      applyMomoStatus({
        status: result.data.status,
        providerStatus: result.data.providerStatus,
        providerReference: result.data.providerReference,
        providerTransactionId: result.data.providerTransactionId,
        failureReason: result.data.failureReason,
      });
    } catch {
      setMomoCollectionStatus('FAILED');
      setMomoCollectionError('Unable to initiate MoMo collection. Please retry.');
    } finally {
      setIsInitiatingMomo(false);
    }
  }, [
    applyMomoStatus,
    isInitiatingMomo,
    momoIdempotencyKey,
    momoNetwork,
    momoPaid,
    momoPayerMsisdn,
    storeId,
  ]);

  useEffect(() => {
    if (!momoCollectionId) return;
    if (momoCollectionStatus !== 'PENDING') return;

    let active = true;
    const poll = async () => {
      const result = await checkMomoCollectionStatusAction(momoCollectionId);
      if (!active || !result.success) return;
      applyMomoStatus({
        status: result.data.status,
        providerStatus: result.data.providerStatus,
        providerReference: result.data.providerReference,
        providerTransactionId: result.data.providerTransactionId,
        failureReason: result.data.failureReason,
      });
    };

    const interval = window.setInterval(() => {
      poll().catch(() => null);
    }, 5000);

    poll().catch(() => null);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [applyMomoStatus, momoCollectionId, momoCollectionStatus]);

  return {
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
    applyMomoStatus,
    handleInitiateMomoCollection,
  };
}
