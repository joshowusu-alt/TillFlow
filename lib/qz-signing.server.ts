import { createSign } from 'crypto';

const normalizePem = (value: string | undefined) => {
  if (!value) return '';
  return value.replace(/\\n/g, '\n').trim();
};

export const getQzCertificate = () => normalizePem(process.env.QZ_TRAY_CERTIFICATE);

const getQzPrivateKey = () => normalizePem(process.env.QZ_TRAY_PRIVATE_KEY);

export const isQzSigningConfigured = () =>
  getQzCertificate().length > 0 && getQzPrivateKey().length > 0;

export const signQzPayload = (payload: string) => {
  const privateKey = getQzPrivateKey();
  if (!privateKey) {
    throw new Error('QZ Tray private key is not configured.');
  }

  const signer = createSign('RSA-SHA512');
  signer.update(payload, 'utf8');
  signer.end();

  return signer.sign(privateKey, 'base64');
};
