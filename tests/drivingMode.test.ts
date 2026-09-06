import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  createDrivingRouter,
  MemoryDrivingModeStore,
  type DrivingModeStore,
} from '../api/drivingMode';

const JWT_SECRET = 'test-driving-secret-key-12345';
process.env.JWT_SECRET = JWT_SECRET;

function generateToken(user: { id: string; email?: string; name?: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

describe('Driving Mode & Safety Auto-Disable Suite', () => {
  let store: DrivingModeStore;
  let app: express.Express;
  let emittedEvents: { event: string; data: any }[];
  let fakeIo: any;

  beforeEach(() => {
    store = new MemoryDrivingModeStore();
    emittedEvents = [];
    fakeIo = {
      emit: vi.fn((event: string, data: any) => {
        emittedEvents.push({ event, data });
      }),
      to: vi.fn(() => ({
        emit: vi.fn((event: string, data: any) => {
          emittedEvents.push({ event, data });
        }),
      })),
      on: vi.fn(),
    };

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(createDrivingRouter({ store, io: fakeIo, jwtSecret: JWT_SECRET }));
  });

  // 1. Multi-user isolation test
  describe('1. Multi-User Isolation', () => {
    it('isolates driving mode state between different authenticated users', async () => {
      const user1Token = generateToken({ id: 'user-1', name: 'Alice' });
      const user2Token = generateToken({ id: 'user-2', name: 'Bobbie' });

      // User 1 turns driving mode ON
      const res1 = await request(app)
        .post('/api/status/driving')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ active: true, phone: '+919876500001', name: 'Alice' });
      expect(res1.status).toBe(200);
      expect(res1.body.isDrivingModeActive).toBe(true);

      // User 2 turns driving mode OFF
      const res2 = await request(app)
        .post('/api/status/driving')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ active: false, phone: '+919876500002', name: 'Bobbie' });
      expect(res2.status).toBe(200);
      expect(res2.body.isDrivingModeActive).toBe(false);

      // Verify User 1's state is still ACTIVE
      const user1State = await store.get('user-1');
      expect(user1State).not.toBeNull();
      expect(user1State!.isDrivingModeActive).toBe(true);
      expect(user1State!.phone).toBe('+919876500001');

      // Verify User 2's state is INACTIVE
      const user2State = await store.get('user-2');
      expect(user2State).not.toBeNull();
      expect(user2State!.isDrivingModeActive).toBe(false);
      expect(user2State!.phone).toBe('+919876500002');

      // Modifying User 2 does not mutate User 1
      await request(app)
        .post('/api/status/driving')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ active: true });
      const checkUser1 = await store.get('user-1');
      expect(checkUser1!.isDrivingModeActive).toBe(true);
    });
  });

  // 2. Auto-disable test, one per trigger
  describe('2. Auto-Disable on Safety Triggers', () => {
    const triggers = [
      'crash_detected',
      'manual_sos',
      'distress_word',
      'emergency_confirmed',
    ] as const;

    triggers.forEach((triggerReason) => {
      it(`auto-disables driving mode and updates TwiML on trigger: ${triggerReason}`, async () => {
        const userId = `victim-${triggerReason}`;
        const token = generateToken({ id: userId, name: 'Driver Test' });

        // Enable driving mode
        await request(app)
          .post('/api/status/driving')
          .set('Authorization', `Bearer ${token}`)
          .send({ active: true, phone: '+919111122222', name: 'Driver Test' });

        const beforeState = await store.get(userId);
        expect(beforeState?.isDrivingModeActive).toBe(true);

        // Twilio voice webhook while driving returns busy announcement and hangs up
        const voiceWhileDriving = await request(app)
          .post(`/api/twilio/voice?userId=${userId}`)
          .send();
        expect(voiceWhileDriving.text).toContain('is currently driving and will call you back');
        expect(voiceWhileDriving.text).toContain('<Hangup/>');
        expect(voiceWhileDriving.text).not.toContain('<Dial');

        // Fire auto-disable safety event
        const disableRes = await request(app)
          .post('/api/status/driving')
          .set('Authorization', `Bearer ${token}`)
          .send({ active: false, reason: triggerReason });
        expect(disableRes.status).toBe(200);
        expect(disableRes.body.isDrivingModeActive).toBe(false);

        // (a) Store shows active: false
        const afterState = await store.get(userId);
        expect(afterState?.isDrivingModeActive).toBe(false);

        // (b) Twilio voice call immediately dials through instead of hanging up
        const voiceAfterDisable = await request(app)
          .post(`/api/twilio/voice?userId=${userId}`)
          .send();
        expect(voiceAfterDisable.text).toContain('<Dial>+919111122222</Dial>');
        expect(voiceAfterDisable.text).not.toContain('is currently driving and will call you back');

        // (c) Socket event driving_mode:forced_off was emitted with correct reason
        const forcedOffEvent = emittedEvents.find(
          (e) => e.event === 'driving_mode:forced_off' && e.data.reason === triggerReason
        );
        expect(forcedOffEvent).toBeDefined();
        expect(forcedOffEvent!.data.userId).toBe(userId);
        expect(forcedOffEvent!.data.active).toBe(false);
      });
    });
  });

  // 3. Hardcoded-name regression test
  describe('3. Hardcoded-Name Regression Prevention', () => {
    it('templates the actual driver name dynamically and rejects hardcoded "Bob"', async () => {
      // User 1: Aarav
      const aaravToken = generateToken({ id: 'user-aarav', name: 'Aarav' });
      await request(app)
        .post('/api/status/driving')
        .set('Authorization', `Bearer ${aaravToken}`)
        .send({ active: true, phone: '+919999911111', name: 'Aarav' });

      const resAarav = await request(app)
        .post('/api/twilio/voice?userId=user-aarav')
        .send();
      expect(resAarav.text).toContain('Aarav is currently driving and will call you back');
      expect(resAarav.text).not.toMatch(/\bBob\b/i);

      // User 2: Priya
      const priyaToken = generateToken({ id: 'user-priya', name: 'Priya' });
      await request(app)
        .post('/api/status/driving')
        .set('Authorization', `Bearer ${priyaToken}`)
        .send({ active: true, phone: '+919999922222', name: 'Priya' });

      const resPriya = await request(app)
        .post('/api/twilio/voice?userId=user-priya')
        .send();
      expect(resPriya.text).toContain('Priya is currently driving and will call you back');
      expect(resPriya.text).not.toMatch(/\bBob\b/i);

      // User with no name defaults to "The driver" and never "Bob"
      const anonToken = generateToken({ id: 'user-anon' });
      await request(app)
        .post('/api/status/driving')
        .set('Authorization', `Bearer ${anonToken}`)
        .send({ active: true, phone: '+919999933333' });

      const resAnon = await request(app)
        .post('/api/twilio/voice?userId=user-anon')
        .send();
      expect(resAnon.text).toContain('The driver is currently driving and will call you back');
      expect(resAnon.text).not.toMatch(/\bBob\b/i);
    });
  });

  // 4. Auth test
  describe('4. Authentication Security', () => {
    it('rejects POST /api/status/driving without token with 401', async () => {
      const res = await request(app)
        .post('/api/status/driving')
        .send({ active: true, phone: '+919876543210' });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Access denied');
    });

    it('rejects POST /api/status/driving with invalid token with 403', async () => {
      const res = await request(app)
        .post('/api/status/driving')
        .set('Authorization', 'Bearer bad-invalid-token')
        .send({ active: true, phone: '+919876543210' });
      expect(res.status).toBe(403);
    });

    it('accepts requests with valid device token fallback', async () => {
      const res = await request(app)
        .post('/api/status/driving')
        .set('x-device-token', 'valid-device-token-123456789')
        .send({ active: true, phone: '+919876543210' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // 5. Twilio signature validation test
  describe('5. Twilio Webhook Signature Security', () => {
    it('rejects voice webhook requests without valid X-Twilio-Signature when validation is active', async () => {
      const originalEnv = process.env.TWILIO_VALIDATE_WEBHOOKS;
      try {
        process.env.TWILIO_VALIDATE_WEBHOOKS = 'true';
        process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';

        const secureApp = express();
        secureApp.use(express.urlencoded({ extended: true }));
        secureApp.use(
          createDrivingRouter({
            store,
            io: fakeIo,
            jwtSecret: JWT_SECRET,
          })
        );

        // Missing X-Twilio-Signature header is rejected (400)
        const resMissing = await request(secureApp)
          .post('/api/twilio/voice')
          .send({ From: '+1234567890' });
        expect(resMissing.status).toBe(400);

        // Invalid X-Twilio-Signature header is rejected (403)
        const resInvalid = await request(secureApp)
          .post('/api/twilio/voice')
          .set('X-Twilio-Signature', 'invalid-signature-hash')
          .send({ From: '+1234567890' });
        expect(resInvalid.status).toBe(403);
      } finally {
        process.env.TWILIO_VALIDATE_WEBHOOKS = originalEnv || 'false';
      }
    });
  });
});
