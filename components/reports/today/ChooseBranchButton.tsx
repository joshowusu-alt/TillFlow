'use client';

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function visibleBranchSelect(): HTMLElement | null {
  const matches = document.querySelectorAll('select#operational-store-switcher');
  for (const element of matches) {
    if (!(element instanceof HTMLElement)) continue;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
      return element;
    }
  }
  return null;
}

export default function ChooseBranchButton() {
  return (
    <button
      type="button"
      className={`btn-primary mt-4 inline-flex min-h-11 items-center ${FOCUS}`}
      onClick={() => {
        visibleBranchSelect()?.focus();
      }}
    >
      Choose a branch
    </button>
  );
}
