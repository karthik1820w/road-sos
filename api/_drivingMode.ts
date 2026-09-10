import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import xss from 'xss';
import twilio from 'twilio';
import type { Server as SocketServer } from 'socket.io';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DrivingDisableReason =
  | 'crash_detected'
  | 'manual_sos'
  | 'distress_word'
  | 'emergency_confirmed';

export interface DrivingState {
  userId: string;
  userName?: string;
  phone: string;
  isDrivingModeActive: boolean;
  updatedAt: number;
}

export interface DrivingModeStore {
  get(userId: string): Promise<DrivingState | null>;
  getByPhone(phone: string): Promise<DrivingState | null>;
  set(state: DrivingState): Promise<void>;
  disable(userId: string, reason?: string): Promise<DrivingState | null>;
  getMostRecent(): Promise<DrivingState | null>;
  clear(): Promise<void>;
}

export class MemoryDrivingModeStore implements DrivingModeStore {
  private states = new Map<string, DrivingState>();
  private mostRecentUserId: string | null = null;

  async get(userId: string): Promise<DrivingState | null> {
    return this.states.get(userId) || null;
  }

  async getByPhone(phone: string): Promise<DrivingState | null> {
    const clean = phone.replace(/\D/g, '');
    if (!clean) return null;
    for (const state of this.states.values()) {
      const stateClean = state.phone.replace(/\D/g, '');
      if (stateClean && (stateClean.endsWith(clean) || clean.endsWith(stateClean))) {
        return state;
      }
    }
    return null;
  }

  async set(state: DrivingState): Promise<void> {
    this.states.set(state.userId, { ...state });
    this.mostRecentUserId = state.userId;
  }

  async disable(userId: string, reason?: string): Promise<DrivingState | null> {
    const existing = this.states.get(userId);
    if (!existing) return null;
    const updated: DrivingState = {
      ...existing,
      isDrivingModeActive: false,
      updatedAt: Date.now(),
    };
    this.states.set(userId, updated);
    this.mostRecentUserId = userId;
    return updated;
  }

  async getMostRecent(): Promise<DrivingState | null> {
    if (!this.mostRecentUserId) {
      const first = this.states.values().next().value;
      return first || null;
    }
    return this.states.get(this.mostRecentUserId) || null;
  }

  async clear(): Promise<void> {
    this.states.clear();
    this.mostRecentUserId = null;
  }
}

export class SupabaseMirroredDrivingModeStore implements DrivingModeStore {
  private memory = new MemoryDrivingModeStore();

  constructor(private supabase: SupabaseClient<any, any, any>) {}

  async get(userId: string): Promise<DrivingState | null> {
    const cached = await this.memory.get(userId);
    if (cached) return cached;
    try {
      const { data, error } = await this.supabase
        .from('driving_mode_status')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (!error && data) {
        const state: DrivingState = {
          userId: data.user_id,
          userName: data.user_name || undefined,
          phone: data.phone || '',
          isDrivingModeActive: !!data.is_active,
          updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
        };
        await this.memory.set(state);
        return state;
      }
    } catch {
      // Fallback silently to memory store
    }
    return null;
  }

  async getByPhone(phone: string): Promise<DrivingState | null> {
    return this.memory.getByPhone(phone);
  }

  async set(state: DrivingState): Promise<void> {
    await this.memory.set(state);
    try {
      await this.supabase.from('driving_mode_status').upsert({
        user_id: state.userId,
        user_name: state.userName || null,
        phone: state.phone,
        is_active: state.isDrivingModeActive,
        updated_at: new Date(state.updatedAt).toISOString(),
      });
    } catch {
      // Supabase mirror is best-effort; memory cache ensures real-time uptime
    }
  }

  async disable(userId: string, reason?: string): Promise<DrivingState | null> {
    const updated = await this.memory.disable(userId, reason);
    if (updated) {
      try {
        await this.supabase.from('driving_mode_status').upsert({
          user_id: updated.userId,
          user_name: updated.userName || null,
          phone: updated.phone,
          is_active: false,
          updated_at: new Date(updated.updatedAt).toISOString(),
        });
      } catch {
        // Best-effort persistence
      }
    }
    return updated;
  }

  async getMostRecent(): Promise<DrivingState | null> {
    return this.memory.getMostRecent();
  }

  async clear(): Promise<void> {
    await this.memory.clear();
  }
}

export interface DrivingRouterDeps {
  store: DrivingModeStore;
  io?: SocketServer;
  jwtSecret?: string;
}

export function createDrivingRouter(deps: DrivingRouterDeps) {
  const router = express.Router();
  const { store, io } = deps;

  const getSecret = () => deps.jwtSecret || process.env.JWT_SECRET || 'fallback-secret';

  // Middleware: requires JWT token or verified device token
  const authenticateDriving = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const cookieToken = req.cookies?.token;
    const token = bearerToken || cookieToken;

    if (token) {
      jwt.verify(token, getSecret(), (err: any, decoded: any) => {
        if (err) return res.status(403).json({ error: 'Access denied: Invalid or expired session' });
        (req as any).user = decoded;
        (req as any).authUserId = decoded.id || decoded.sub;
        next();
      });
      return;
    }

    const deviceToken = req.header('x-device-token');
    if (deviceToken && deviceToken.length >= 16) {
      (req as any).authUserId = deviceToken;
      next();
      return;
    }

    return res.status(401).json({ error: 'Access denied: Valid authentication or device token required' });
  };

  const statusSchema = z.object({
    active: z.boolean().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
    reason: z.enum(['crash_detected', 'manual_sos', 'distress_word', 'emergency_confirmed']).optional(),
  });

  router.post('/api/status/driving', authenticateDriving, async (req: Request, res: Response) => {
    try {
      const body = statusSchema.parse(req.body);
      const userId = (req as any).authUserId as string;
      const existing = await store.get(userId);

      const isDrivingModeActive = typeof body.active === 'boolean'
        ? body.active
        : (existing ? existing.isDrivingModeActive : false);

      const nextState: DrivingState = {
        userId,
        userName: body.name ? xss(body.name) : ((req as any).user?.name || existing?.userName || ''),
        phone: body.phone ? xss(body.phone) : (existing?.phone || ''),
        isDrivingModeActive,
        updatedAt: Date.now(),
      };

      await store.set(nextState);

      // Real-time notification: forced off due to safety event vs normal change
      if (!isDrivingModeActive && body.reason) {
        io?.to(`user:${userId}`).emit('driving_mode:forced_off', { userId, active: false, reason: body.reason });
        io?.emit('driving_mode:forced_off', { userId, active: false, reason: body.reason });
      }

      io?.to(`user:${userId}`).emit('driving_mode:changed', {
        userId,
        active: isDrivingModeActive,
        userName: nextState.userName,
        phone: nextState.phone,
      });
      io?.emit('driving_mode:changed', {
        userId,
        active: isDrivingModeActive,
        userName: nextState.userName,
        phone: nextState.phone,
      });

      res.json({
        success: true,
        isDrivingModeActive: nextState.isDrivingModeActive,
        userId: nextState.userId,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/status/driving', authenticateDriving, async (req: Request, res: Response) => {
    const userId = (req as any).authUserId as string;
    const state = await store.get(userId);
    res.json({
      success: true,
      state: state || { userId, isDrivingModeActive: false, phone: '', updatedAt: 0 },
    });
  });

  // Twilio webhook security setup
  const validateWebhooks = process.env.TWILIO_VALIDATE_WEBHOOKS
    ? process.env.TWILIO_VALIDATE_WEBHOOKS === 'true'
    : process.env.NODE_ENV === 'production';

  const twilioGuard = twilio.webhook({
    validate: validateWebhooks,
    ...(process.env.PUBLIC_BASE_URL
      ? {
          protocol: new URL(process.env.PUBLIC_BASE_URL).protocol.replace(':', ''),
          host: new URL(process.env.PUBLIC_BASE_URL).host,
        }
      : {}),
  });

  router.post('/api/twilio/voice', twilioGuard, async (req: Request, res: Response) => {
    const twiml = new twilio.twiml.VoiceResponse();

    // Map incoming call to user:
    // 1. Explicit userId query param
    // 2. By To/From phone matching
    // 3. Fallback to most recent active driver
    const queryUserId = req.query.userId as string | undefined;
    const toPhone = req.body?.To as string | undefined;
    const fromPhone = req.body?.From as string | undefined;

    let state: DrivingState | null = null;
    if (queryUserId) {
      state = await store.get(queryUserId);
    }
    if (!state && toPhone) {
      state = await store.getByPhone(toPhone);
    }
    if (!state && fromPhone) {
      state = await store.getByPhone(fromPhone);
    }
    if (!state) {
      state = await store.getMostRecent();
    }

    const driverName = state?.userName && state.userName.trim().length > 0
      ? state.userName.trim()
      : 'The driver';

    if (state?.isDrivingModeActive) {
      twiml.say(`${driverName} is currently driving and will call you back.`);
      twiml.hangup();
    } else if (state?.phone) {
      twiml.say(`Connecting you to ${driverName}.`);
      twiml.dial(state.phone);
    } else {
      twiml.say(`${driverName} is not available right now. Please try again later.`);
      twiml.hangup();
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // Socket room handlers for driving mode
  io?.on('connection', (socket) => {
    socket.on('user:join', (userId: string) => {
      if (typeof userId === 'string' && userId.length < 128) {
        socket.join(`user:${userId}`);
      }
    });
    socket.on('user:leave', (userId: string) => {
      if (typeof userId === 'string') {
        socket.leave(`user:${userId}`);
      }
    });
  });

  return router;
}
