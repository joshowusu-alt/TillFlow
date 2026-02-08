declare global {
  interface Window {
    qz?: any;
  }
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
  if (typeof window === 'undefined' || !window.qz) {
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

