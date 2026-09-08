import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { IncidentEngine, MemoryIncidentStore, createIncidentRouter, canTransition, normalizePhone, isValidE164, renderIncidentPdf, signReportToken, type Incident } from '../api/incidents';

process.env.TWILIO_VALIDATE_WEBHOOKS = 'false';

function fakeTwilio(opts: { smsFail?: number; callFail?: number; permanent?: boolean } = {}) {
  let smsFails = opts.smsFail ?? 0;
  let callFails = opts.callFail ?? 0;
  const messages: any[] = [];
  const calls: any[] = [];
  const client: any = {
    messages: { create: vi.fn(async (m: any) => { if (smsFails-- > 0) throw new Error(opts.permanent ? 'Authenticate' : 'HTTP 503 upstream'); messages.push(m); return { sid: `SM${messages.length}` }; }) },
    calls: { create: vi.fn(async (c: any) => { if (callFails-- > 0) throw new Error(opts.permanent ? 'Trial account unverified' : 'HTTP 503 upstream'); calls.push(c); return { sid: `CA${calls.length}` }; }) },
  };
  return { client, messages, calls };
}

const baseInput = (contacts: string[] = ['+919999900001']) => ({
  deviceToken: 'device-token-1234567890',
  kind: 'CRASH' as const,
  reason: 'test crash',
  location: { lat: 12.97, lng: 77.59 },
  address: 'MG Road, Bengaluru',
  confidence: 'HIGH' as const,
  patient: { name: 'Asha', bloodGroup: 'O+' },
  contacts,
});

describe('incident state machine', () => {
  it('only allows legal transitions', () => {
    expect(canTransition('DETECTED', 'DISPATCHED')).toBe(true);
    expect(canTransition('PROBING', 'ACKED')).toBe(false);
    expect(canTransition('ACKED', 'CANCELLED')).toBe(false);
    expect(canTransition('CLOSED', 'DISPATCHED')).toBe(false);
  });

  it('normalises Indian numbers to E.164 and rejects junk', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(isValidE164(normalizePhone('++++++++++'))).toBe(false);
  });
});

describe('IncidentEngine.dispatch', () => {
  let store: MemoryIncidentStore;
  beforeEach(() => { store = new MemoryIncidentStore(); });

  it('sends SMS then call per contact and records real statuses', async () => {
    const tw = fakeTwilio();
    const engine = new IncidentEngine({ store, getTwilio: () => tw.client, fromNumber: '+15550000000' });
    const inc = await engine.create(baseInput(['+919999900001', '+919999900002']));
    expect(inc.state).toBe('PROBING');
    await engine.dispatch(inc, 'https://example.test');
    expect(inc.state).toBe('DISPATCHED');
    expect(inc.deliveries).toHaveLength(4);
    expect(inc.deliveries.every(d => d.status === 'sent')).toBe(true);
    expect(tw.messages[0].body).toContain('Asha');
    expect(tw.messages[0].body).toContain('/api/incidents/' + inc.id + '/report.pdf?t=');
    expect(tw.messages[0].body).not.toMatch(/BOB/);
    expect(tw.calls[0].twiml).toContain(`/api/twilio/incidents/${inc.id}/gather`);
  });

  it('retries transient failures and reports permanent failures as failed (never fake success)', async () => {
    const tw = fakeTwilio({ smsFail: 1 });
    const engine = new IncidentEngine({ store, getTwilio: () => tw.client, fromNumber: '+15550000000' });
    const inc = await engine.create(baseInput());
    await engine.dispatch(inc, 'https://example.test');
    const sms = inc.deliveries.find(d => d.channel === 'sms')!;
    expect(sms.status).toBe('sent');
    expect(sms.attempts).toBe(2);

    const tw2 = fakeTwilio({ smsFail: 5, callFail: 5, permanent: true });
    const engine2 = new IncidentEngine({ store, getTwilio: () => tw2.client, fromNumber: '+15550000000' });
    const inc2 = await engine2.create(baseInput());
    await engine2.dispatch(inc2, 'https://example.test');
    expect(inc2.deliveries.every(d => d.status === 'failed')).toBe(true);
    expect(inc2.deliveries[0].attempts).toBe(1); // permanent → no retry
    expect(inc2.deliveries[0].error).toMatch(/Authenticate/);
  });

  it('fails loudly when Twilio is not configured', async () => {
    const engine = new IncidentEngine({ store, getTwilio: () => { throw new Error('Twilio credentials not configured'); }, fromNumber: undefined });
    const inc = await engine.create(baseInput());
    await engine.dispatch(inc, 'https://example.test');
    expect(inc.deliveries.every(d => d.status === 'failed')).toBe(true);
  });

  it('refuses to dispatch without contacts', async () => {
    const tw = fakeTwilio();
    const engine = new IncidentEngine({ store, getTwilio: () => tw.client, fromNumber: '+1' });
    const inc = await engine.create(baseInput([]));
    await expect(engine.dispatch(inc, 'https://x')).rejects.toThrow('NO_CONTACTS');
  });

  it('is idempotent on create with the same key and on repeated dispatch', async () => {
    const tw = fakeTwilio();
    const engine = new IncidentEngine({ store, getTwilio: () => tw.client, fromNumber: '+1' });
    const a = await engine.create(baseInput(), 'key-1');
    const b = await engine.create(baseInput(), 'key-1');
    expect(a.id).toBe(b.id);
    await engine.dispatch(a, 'https://x');
    await engine.dispatch(a, 'https://x');
    expect(tw.messages).toHaveLength(1);
  });
});

describe('incident HTTP API + Twilio webhooks', () => {
  const tw = fakeTwilio();
  const store = new MemoryIncidentStore();
  const engine = new IncidentEngine({ store, getTwilio: () => tw.client, fromNumber: '+15550000000' });
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(createIncidentRouter(engine, store));
  const token = 'device-token-abcdefghijklmnop';

  it('create → dispatch → keypress ack → report, with device-token ownership', async () => {
    const created = await request(app).post('/api/incidents').set('X-Device-Token', token)
      .send({ kind: 'MANUAL_SOS', reason: 'button', location: { lat: 1, lng: 2 }, patient: { name: 'Ravi' }, contacts: ['98765 43210'] });
    expect(created.status).toBe(201);
    const id = created.body.incident.id as string;
    expect(created.body.incident.contacts).toEqual(['+919876543210']);
    expect(created.body.incident.deviceToken).toBeUndefined();

    const forbidden = await request(app).post(`/api/incidents/${id}/dispatch`).set('X-Device-Token', 'someone-else-token-xxxxxxxxxx');
    expect(forbidden.status).toBe(403);

    const dispatched = await request(app).post(`/api/incidents/${id}/dispatch`).set('X-Device-Token', token);
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.summary).toEqual({ total: 2, sent: 2, failed: 0, allFailed: false });

    const gather = await request(app).post(`/api/twilio/incidents/${id}/gather?to=%2B919876543210`).type('form').send({ Digits: '1' });
    expect(gather.status).toBe(200);
    expect(gather.text).toContain('<Say>');
    const after = await request(app).get(`/api/incidents/${id}`).set('X-Device-Token', token);
    expect(after.body.incident.state).toBe('ACKED');
    expect(after.body.incident.ack.via).toBe('call_keypress');

    const stored = (await store.get(id)) as Incident;
    const bad = await request(app).get(`/api/incidents/${id}/report.pdf?t=deadbeef`);
    expect(bad.status).toBe(403);
    const pdf = await request(app).get(`/api/incidents/${id}/report.pdf?t=${stored.reportToken}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(stored.reportToken).toBe(signReportToken(id));
  });

  it('acknowledges via SMS reply from a known contact', async () => {
    const created = await request(app).post('/api/incidents').set('X-Device-Token', token)
      .send({ kind: 'SAFETY_WORD', reason: 'word', patient: { name: 'Meera' }, contacts: ['+919111100000'] });
    const id = created.body.incident.id;
    await request(app).post(`/api/incidents/${id}/dispatch`).set('X-Device-Token', token);
    const reply = await request(app).post('/api/twilio/sms').type('form').send({ From: '+919111100000', Body: 'Yes coming' });
    expect(reply.text).toContain('Thank you');
    const after = await request(app).get(`/api/incidents/${id}`).set('X-Device-Token', token);
    expect(after.body.incident.state).toBe('ACKED');
    expect(after.body.incident.ack.via).toBe('sms_reply');
  });

  it('records delivery status callbacks', async () => {
    const created = await request(app).post('/api/incidents').set('X-Device-Token', token)
      .send({ kind: 'MEDICAL', reason: 'x', patient: { name: 'A' }, contacts: ['+919222200000'] });
    const id = created.body.incident.id;
    const d = await request(app).post(`/api/incidents/${id}/dispatch`).set('X-Device-Token', token);
    const smsSid = (await store.get(id))!.deliveries.find(x => x.channel === 'sms')!.sid;
    await request(app).post(`/api/twilio/incidents/${id}/status?channel=sms`).type('form').send({ MessageSid: smsSid, MessageStatus: 'delivered' });
    const after = await request(app).get(`/api/incidents/${id}`).set('X-Device-Token', token);
    expect(after.body.incident.deliveries.find((x: any) => x.channel === 'sms').status).toBe('delivered');
    expect(d.status).toBe(200);
  });

  it('renders a PDF with QR for an incident without location', async () => {
    const inc = await engine.create({ ...baseInput(), location: undefined, address: undefined });
    const buf = await renderIncidentPdf(inc);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('MANUAL_SOS and SAFETY_WORD automatically prepend policeNumber', async () => {
    const tw = fakeTwilio();
    const polNumber = '+919999900088'; // synthetic fixture
    const hospNumber = '+919999900099';
    const testEngine = new IncidentEngine({ store, getTwilio: () => tw.client, fromNumber: '+15550000000', policeNumber: polNumber, hospitalNumber: hospNumber });
    const inc = await testEngine.create({
      ...baseInput(['+919999900001']),
      kind: 'SAFETY_WORD',
      reason: 'Silent distress',
      patient: { name: 'Karthik' }
    });

    await testEngine.dispatch(inc, 'https://example.test');

    // policeNumber was automatically prepended to contacts
    expect(inc.contacts).toContain(polNumber);
    // hospitalNumber was NOT prepended
    expect(inc.contacts).not.toContain(hospNumber);

    // Messages sent to both contacts
    const targets = tw.messages.map((m: any) => m.to);
    expect(targets).toContain(polNumber);
    expect(targets).toContain('+919999900001');
  });

  it('VOICE_HELP automatically prepends hospitalNumber and attaches AI medical analysis and recommended hospitals', async () => {
    const tw = fakeTwilio();
    const hospNumber = '+919999900099'; // synthetic fixture
    const testEngine = new IncidentEngine({ store, getTwilio: () => tw.client, fromNumber: '+15550000000', hospitalNumber: hospNumber });
    const inc = await testEngine.create({
      ...baseInput(['+919999900001']),
      kind: 'VOICE_HELP',
      reason: 'Voice activated emergency distress alert (HELP spoken 3 times)',
      patient: { name: 'Karthik', bloodGroup: 'O+', conditions: 'Asthma' }
    });

    await testEngine.dispatch(inc, 'https://example.test');

    // Hospital_NUMBER was automatically prepended to contacts
    expect(inc.contacts).toContain(hospNumber);
    // Medical analysis was generated and attached
    expect(inc.aiMedicalAnalysis).toBeDefined();
    expect(inc.aiMedicalAnalysis?.condition).toBeTruthy();
    expect(inc.recommendedHospitals).toBeDefined();
    expect(inc.recommendedHospitals!.length).toBeGreaterThan(0);

    // Messages sent to both contacts (patient emergency contact AND Hospital_NUMBER)
    const targets = tw.messages.map((m: any) => m.to);
    expect(targets).toContain(hospNumber);
    expect(targets).toContain('+919999900001');

    // Both SMS and call were placed to Hospital_NUMBER
    const callTargets = tw.calls.map((c: any) => c.to);
    expect(callTargets).toContain(hospNumber);

    // Render handover PDF containing the medical analysis and recommended hospitals
    const pdfBuf = await renderIncidentPdf(inc);
    expect(pdfBuf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
