'use client';

export default function RecordPurchaseButton() {
  function handleClick() {
    const details = document.getElementById('record-purchase-form');
    if (details instanceof HTMLDetailsElement) {
      details.open = true;
    }
    details?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="btn-primary justify-center text-sm sm:w-auto"
    >
      Record purchase
    </button>
  );
}
