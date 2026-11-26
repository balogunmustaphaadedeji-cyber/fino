import QRCode from 'qrcode';

/** Generate a data-URL QR code for a FINO profile deep link. */
export async function profileQrDataUrl(userId: string, size = 256): Promise<string> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fino.app';
  const url = `${origin}/social?profile=${encodeURIComponent(userId)}`;
  return QRCode.toDataURL(url, {
    width: size,
    margin: 2,
    color: { dark: '#171B18', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
}
