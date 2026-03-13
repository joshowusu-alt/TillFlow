declare global {
  interface Window {
    qz?: any;
  }
}

let loadPromise: Promise<void> | null = null;

async function fetchQzText(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `QZ request failed (${response.status})`);
  }
  return text;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeQzError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error('Direct print failed.');
  }

  const message = `${error.name} ${error.message}`.toLowerCase();
  if (message.includes('failed to load qz-tray') || message.includes('qz-tray.js')) {
    return new Error('The direct print helper could not be loaded. Check that the local QZ helper script is available, or use browser printing instead.');
  }
  if (message.includes('timed out') || message.includes('timeout')) {
    return new Error('The printer connection took too long. Make sure QZ Tray is running, then try direct print again.');
  }
  if (message.includes('websocket') || message.includes('connection')) {
    return new Error('Could not reach QZ Tray on this device. Start QZ Tray, then try direct print again.');
  }

  return error;
}

/** Lazily load the qz-tray script on first use */
function loadQzScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Not in browser'));
  if (window.qz) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/api/qz/script';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load qz-tray.js'));
    document.head.appendChild(s);
  });
  return loadPromise;
}

const configureSecurity = (qz: any) => {
  if (!qz?.security) return;
  if (typeof qz.security.setSignatureAlgorithm === 'function') {
    qz.security.setSignatureAlgorithm('SHA512');
  }
  if (typeof qz.security.setCertificatePromise === 'function') {
    qz.security.setCertificatePromise((resolve: (value: string) => void) => {
      fetchQzText('/api/qz/certificate')
        .then((certificate) => resolve(certificate))
        .catch((error) => {
          console.warn('[qz] Certificate unavailable, falling back to unsigned printing.', error);
          resolve('');
        });
    });
  }
  if (typeof qz.security.setSignaturePromise === 'function') {
    qz.security.setSignaturePromise((toSign: string) => {
      return (resolve: (value: string) => void) => {
        fetchQzText('/api/qz/sign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ request: toSign })
        })
          .then((signature) => resolve(signature))
          .catch((error) => {
            console.warn('[qz] Signature unavailable, falling back to unsigned printing.', error);
            resolve('');
          });
      };
    });
  }
};

export const ensureQzConnection = async () => {
  try {
    if (typeof window === 'undefined') {
      throw new Error('QZ Tray not available. Install and run QZ Tray to use direct printing.');
    }
    await withTimeout(loadQzScript(), 8000, 'Loading QZ Tray timed out.');
    if (!window.qz) {
      throw new Error('QZ Tray not available. Install and run QZ Tray to use direct printing.');
    }
    const qz = window.qz;
    configureSecurity(qz);
    if (!qz.websocket.isActive()) {
      await withTimeout(qz.websocket.connect(), 8000, 'Connecting to QZ Tray timed out.');
    }
    return qz;
  } catch (error) {
    throw normalizeQzError(error);
  }
};

export const printRawEscPos = async (printerName: string | null, hexData: string) => {
  try {
    await withTimeout(loadQzScript(), 8000, 'Loading QZ Tray timed out.');
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
    return await withTimeout(qz.print(config, data), 10000, 'Printing to QZ Tray timed out.');
  } catch (error) {
    throw normalizeQzError(error);
  }
};
