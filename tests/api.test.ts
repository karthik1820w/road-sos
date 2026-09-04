import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes, { authenticateToken } from '../api/auth.js';

// Mock express app for testing auth middleware
const app = express();
app.use(express.json());

// Add a mock endpoint protected by authenticateToken
app.post('/api/sos/trigger', authenticateToken, (req, res) => {
  res.json({ success: true });
});

describe('API Integration & Security', () => {
  it('rejects /api/sos/* requests without a valid token (401)', async () => {
    const res = await request(app).post('/api/sos/trigger').send({ incidentId: '123' });
    expect(res.status).toBe(401);
  });

  it('rejects /api/sos/* requests with an invalid/expired token (403)', async () => {
    const res = await request(app)
      .post('/api/sos/trigger')
      .set('Authorization', 'Bearer invalid-token')
      .send({ incidentId: '123' });
    expect(res.status).toBe(403);
  });
});
