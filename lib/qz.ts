declare global {
  interface Window {
    qz?: any;
  }
}

let loadPromise: Promise<void> | null = null;

/** Lazily load the qz-tray script on first use */
function loadQzScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Not in browser'));
  if (window.qz) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qz-tray/2.1.0/qz-tray.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load qz-tray.js'));
    document.head.appendChild(s);
  });
  return loadPromise;
}

const configureSecurity = (qz: any) => {
  if (!qz?.security) return;
  if (typeof qz.security.setCertificatePromise === 'function') {
    qz.security.setCertificatePromise(() => Promise.resolve(''));
  }
  if (typeof qz.security.setSignaturePromise === 'function') {
    qz.security.setSignaturePromise(() => Promise.resolve(''));
  }
};

export const ensureQzConnection = async () => {
  if (typeof window === 'undefined') {
    throw new Error('QZ Tray not available. Install and run QZ Tray to use direct printing.');
  }
  await loadQzScript();
  if (!window.qz) {
    throw new Error('QZ Tray not available. Install and run QZ Tray to use direct printing.');
  }
  const qz = window.qz;
  configureSecurity(qz);
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  return qz;
};

export const printRawEscPos = async (printerName: string | null, hexData: string) => {
  await loadQzScript();
  if (typeof window === 'undefined' || !window.qz) {
    throw new Error('QZ Tray not available.');
  }
  const qz = window.qz;
  const config = qz.configs.create(printerName || null);
  const data = [
    {
      type: 'raw',
      format: 'hex',
      data: hexData
    }
  ];
  return qz.print(config, data);
};

