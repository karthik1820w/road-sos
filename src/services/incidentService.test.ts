import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attemptAutomaticNativeFallback, type CreateIncidentInput } from './incidentService';
import type { EmergencyFallbackPlugin } from './emergencyFallbackPlugin';

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    },
    registerPlugin: () => ({
      sendEmergencySms: vi.fn(),
      dialEmergencySequence: vi.fn(),
    })
  };
});

describe('attemptAutomaticNativeFallback', () => {
  let mockPlugin: EmergencyFallbackPlugin;
  let speakMock: (msg: string) => void;

  beforeEach(() => {
    mockPlugin = {
      sendEmergencySms: vi.fn().mockResolvedValue({ sent: ['123'], failed: [] }),
      dialEmergencySequence: vi.fn().mockResolvedValue({ reached: '123', attempted: ['123'] })
    };
    speakMock = vi.fn();
    
    // reset env vars for predictability
    import.meta.env.VITE_POLICE_NUMBER = '100';
    import.meta.env.VITE_HOSPITAL_NUMBER = '108';
  });

  it('prepends police number for danger pathways (MANUAL_SOS)', async () => {
    const input: CreateIncidentInput = {
      kind: 'MANUAL_SOS',
      reason: 'test manual trigger',
      patient: { name: 'Test User' },
      contacts: ['+1234567890'],
    };

    const success = await attemptAutomaticNativeFallback(input, mockPlugin, speakMock);
    
    expect(success).toBe(true);
    expect(speakMock).toHaveBeenCalledWith('Sending automatic emergency messages now');
    
    // Should have unshifted VITE_POLICE_NUMBER
    expect(mockPlugin.sendEmergencySms).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: ['100', '+1234567890']
      })
    );
    expect(mockPlugin.dialEmergencySequence).toHaveBeenCalledWith(
      expect.objectContaining({
        numbers: ['100', '+1234567890']
      })
    );
  });

  it('prepends hospital number for medical pathways', async () => {
    const input: CreateIncidentInput = {
      kind: 'MEDICAL',
      reason: 'test medical condition',
      patient: { name: 'Test User' },
      contacts: ['+1234567890'],
    };

    await attemptAutomaticNativeFallback(input, mockPlugin, speakMock);
    
    expect(mockPlugin.sendEmergencySms).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: ['108', '+1234567890']
      })
    );
  });

  it('returns false when plugin throws a permission error or native failure', async () => {
    (mockPlugin.sendEmergencySms as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('permission denied'));
    
    const input: CreateIncidentInput = {
      kind: 'CRASH',
      reason: 'test crash detected',
      patient: { name: 'Test User' },
      contacts: ['+1234567890'],
    };

    const success = await attemptAutomaticNativeFallback(input, mockPlugin, speakMock);
    
    expect(success).toBe(false);
  });

  it('does not duplicate official number if it is already present in contacts', async () => {
    const input: CreateIncidentInput = {
      kind: 'MANUAL_SOS',
      reason: 'test deduplication',
      patient: { name: 'Test User' },
      contacts: ['100', '+1234567890'],
    };

    await attemptAutomaticNativeFallback(input, mockPlugin, speakMock);
    
    expect(mockPlugin.sendEmergencySms).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: ['100', '+1234567890'] // 100 should not be duplicated
      })
    );
  });
});
