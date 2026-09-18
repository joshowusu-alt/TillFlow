let blocked = false;

export function setStaleOperationalStoreBlocked(next: boolean) {
  blocked = next;
  if (typeof document !== 'undefined') {
    if (next) document.documentElement.dataset.staleOperationalStore = '1';
    else delete document.documentElement.dataset.staleOperationalStore;
  }
}

export function isStaleOperationalStoreBlocked() {
  return blocked;
}
