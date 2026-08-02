'use client';

/**
 * Automated reversal is unavailable in inventory-decrease Phase 1.
 * Component retained so historical links/tests do not 404; it never submits a reverse.
 */
export default function ReverseStockAdjustmentForm({
  disabled,
}: {
  adjustmentId: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return <span className="pill bg-black/5 text-black/45">Reversal recorded</span>;
  }

  return (
    <span className="text-xs text-black/45">
      Automated reversal unavailable (Phase 1 decreases only)
    </span>
  );
}
