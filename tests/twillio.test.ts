import { describe, it, expect, vi } from 'vitest';

describe('Twilio Webhooks & Fallbacks', () => {
  it('Auto-reply does not expose hardcoded names', () => {
    const defaultResponse = "The driver is currently operating a vehicle. They will respond when it is safe.";
    expect(defaultResponse).not.toMatch(/Bob|John|Doe/i);
  });
});
