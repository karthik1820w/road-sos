import { registerPlugin } from '@capacitor/core';

export interface EmergencyFallbackPlugin {
  sendEmergencySms(options: { contacts: string[]; body: string }): Promise<{ sent: string[]; failed: string[] }>;
  dialEmergencySequence(options: { numbers: string[]; perCallTimeoutMs?: number }): Promise<{ reached: string | null; attempted: string[] }>;
}

export const EmergencyFallback = registerPlugin<EmergencyFallbackPlugin>('EmergencyFallback');
