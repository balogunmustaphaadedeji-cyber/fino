import { describe, it, expect } from 'vitest';
import { profileQrDataUrl } from '../utils/qr';

describe('profileQrDataUrl', () => {
  it('returns a data URL PNG for a user id', async () => {
    const url = await profileQrDataUrl('00000000-0000-4000-8000-000000000001', 128);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url.length).toBeGreaterThan(100);
  });
});
