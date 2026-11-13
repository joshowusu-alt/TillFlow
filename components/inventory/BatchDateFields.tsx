'use client';

import type { ChangeEvent } from 'react';

type BatchDateFieldsProps = {
  idPrefix: string;
  productionName?: string;
  expiryName?: string;
  productionDate?: string;
  expiryDate?: string;
  onProductionDate?: (value: string) => void;
  onExpiryDate?: (value: string) => void;
};

export default function BatchDateFields({
  idPrefix,
  productionName,
  expiryName,
  productionDate = '',
  expiryDate = '',
  onProductionDate,
  onExpiryDate,
}: BatchDateFieldsProps) {
  const controlled = Boolean(onProductionDate || onExpiryDate);
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <label className="label" htmlFor={`${idPrefix}-production`}>Production date (optional)</label>
        <input
          id={`${idPrefix}-production`}
          className="input w-full min-w-0 max-w-full"
          type="date"
          name={productionName}
          {...(controlled
            ? { value: productionDate, onChange: (event: ChangeEvent<HTMLInputElement>) => onProductionDate?.(event.target.value) }
            : { defaultValue: productionDate })}
        />
      </div>
      <div className="min-w-0">
        <label className="label" htmlFor={`${idPrefix}-expiry`}>Expiry date (optional)</label>
        <input
          id={`${idPrefix}-expiry`}
          className="input w-full min-w-0 max-w-full"
          type="date"
          name={expiryName}
          {...(controlled
            ? { value: expiryDate, onChange: (event: ChangeEvent<HTMLInputElement>) => onExpiryDate?.(event.target.value) }
            : { defaultValue: expiryDate })}
        />
      </div>
      <p className="text-xs leading-5 text-black/50 sm:col-span-2">
        Optional on every delivery. Leave either date blank if you do not have it. When both are filled, expiry must be on or after the production date.
      </p>
    </div>
  );
}
