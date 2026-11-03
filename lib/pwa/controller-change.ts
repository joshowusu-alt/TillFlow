/** First installation claims fresh HTML; only replacement makes an open tab stale. */
export function createControllerChangeHandler(
  readController: () => object | null,
  onReplacement: () => void,
) {
  let previous = readController();
  return () => {
    const current = readController();
    const replaced = previous !== null && current !== null && current !== previous;
    previous = current;
    if (replaced) onReplacement();
  };
}
