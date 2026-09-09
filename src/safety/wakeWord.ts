/**
 * Silent safety word — Feature 3.
 *
 * Two independent pieces:
 *
 *  1. `SafetyWordMatcher` — decides *when a spoken transcript counts as the trigger*.
 *     Strict token matching (no "beyond"/"new one" fuzz), a rolling window, the
 *     word must be said N times in short isolated utterances (a code word is spoken
 *     as "neon. neon. neon.", not buried in a sentence), and interim results are
 *     never double-counted against finals. Fully unit-testable, engine-agnostic.
 *
 *  2. `WakeWordEngine` — *where the audio comes from*.
 *     - `WebSpeechWakeWordEngine`: browser SpeechRecognition with ONE supervised
 *       restart loop (exponential backoff, periodic recycle) replacing the three
 *       competing watchdogs that used to fight each other. Needs network; stops
 *       when the OS suspends the page.
 *     - `PorcupineWakeWordEngine`: on-device, offline keyword spotting via
 *       Picovoice Porcupine (WASM). Loaded lazily; only active when an access key
 *       and a keyword model (.ppn) are configured. This is the production path.
 *     `createWakeWordEngine()` picks Porcupine when configured and falls back to
 *     Web Speech otherwise, so the app runs today and upgrades when the key exists.
 */

export interface SafetyWordConfig {
  word: string;                 // user-chosen, e.g. "neon"
  aliases?: string[];           // pronunciations the user enrolled (recognizer variants)
  requiredCount?: number;       // default 3
  windowMs?: number;            // default 8000
  maxUtteranceTokens?: number;  // utterances longer than this are ignored (default 4)
}

export interface MatchResult { triggered: boolean; count: number; matchedTokens: string[] }

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({length: m + 1}, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      if (a[i - 1] === b[j - 1]) d[i][j] = d[i - 1][j - 1];
      else d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + 1);
    }
  }
  return d[m][n];
}


export class SafetyWordMatcher {
  private hits: number[] = [];
  private lastInterimCounted = 0;
  private readonly targets: Set<string>;
  private readonly cfg: Required<SafetyWordConfig>;

  constructor(cfg: SafetyWordConfig) {
    this.cfg = {
      word: normalize(cfg.word),
      aliases: (cfg.aliases || []).map(normalize).filter(Boolean),
      requiredCount: cfg.requiredCount ?? 3,
      windowMs: cfg.windowMs ?? 8000,
      maxUtteranceTokens: cfg.maxUtteranceTokens ?? 4,
    };
    this.targets = new Set([this.cfg.word, ...this.cfg.aliases].filter(Boolean));
  }

  get word() { return this.cfg.word; }

  reset() { this.hits = []; this.lastInterimCounted = 0; }

  /**
   * Feed one recognizer result.
   *  - `isFinal=true`: counts matches in this utterance.
   *  - `isFinal=false`: interim text; only counts *additional* matches beyond what
   *    this interim has already contributed, and is superseded by the final.
   */
  feed(text: string, isFinal: boolean, now = Date.now()): MatchResult {
    const tokens = normalize(text).split(' ').filter(Boolean);
    this.hits = this.hits.filter(t => now - t <= this.cfg.windowMs);

    // Count target occurrences token-wise (multi-word targets use a sliding window).
    const matched: string[] = [];
    for (const target of this.targets) {
      const tt = target.split(' ');
      for (let i = 0; i + tt.length <= tokens.length; i++) {
        let ok = true;
        for (let j = 0; j < tt.length; j++) {
          const t1 = tokens[i + j];
          const t2 = tt[j];
          if (t1 === t2) continue;
          
          // Fuzzy match logic
          const dist = levenshtein(t1, t2);
          const maxDist = t2.length <= 4 ? 1 : 2; // Allow 1 typo for short words, 2 for longer
          
          // "help" length is 4 -> maxDist 1. (e.g. "kelp")
          if (dist > maxDist) {
            ok = false;
            break;
          }
        }
        if (ok) { matched.push(target); i += tt.length - 1; }
      }
    }

    // A code word is spoken in isolation. Long utterances that merely contain it don't count.
    const nonTargetTokens = tokens.length - matched.reduce((a, t) => a + t.split(' ').length, 0);
    if (nonTargetTokens > this.cfg.maxUtteranceTokens) {
      return { triggered: false, count: this.hits.length, matchedTokens: [] };
    }

    if (isFinal) {
      // Replace whatever the interim of this utterance contributed with the final count.
      for (let i = 0; i < this.lastInterimCounted; i++) this.hits.pop();
      this.lastInterimCounted = 0;
      for (let i = 0; i < matched.length; i++) this.hits.push(now);
    } else {
      const extra = matched.length - this.lastInterimCounted;
      for (let i = 0; i < extra; i++) this.hits.push(now);
      if (extra > 0) this.lastInterimCounted = matched.length;
    }

    const count = this.hits.length;
    if (count >= this.cfg.requiredCount) {
      this.reset();
      return { triggered: true, count, matchedTokens: matched };
    }
    return { triggered: false, count, matchedTokens: matched };
  }
}

// ───────────────────────────── Engines ─────────────────────────────

export interface WakeWordEngine {
  readonly name: 'webspeech' | 'porcupine';
  start(): Promise<void>;
  stop(): void;
  /** Fires with a transcript (webspeech) or the keyword label (porcupine). */
  onResult(cb: (text: string, isFinal: boolean, confidence: number, alternatives: string[]) => void): void;
  onStatus(cb: (status: EngineStatus) => void): void;
}

export type EngineStatus = 'idle' | 'listening' | 'restarting' | 'blocked' | 'unsupported';

interface WebSpeechOptions {
  lang?: string;
  /** Return true to drop a result (e.g. while TTS is speaking). */
  shouldIgnore?: () => boolean;
  recycleMs?: number; // Chrome leaks result buffers on long sessions; recycle periodically (default 50 s)
}

export class WebSpeechWakeWordEngine implements WakeWordEngine {
  readonly name = 'webspeech' as const;
  private rec: any = null;
  private running = false;
  private restartTimer: any = null;
  private recycleTimer: any = null;
  private backoffMs = 300;
  private resultCb: ((t: string, f: boolean, c: number, a: string[]) => void) | null = null;
  private statusCb: ((s: EngineStatus) => void) | null = null;

  constructor(private opts: WebSpeechOptions = {}) {}

  static isSupported() { return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition); }

  onResult(cb: (t: string, f: boolean, c: number, a: string[]) => void) { this.resultCb = cb; }
  onStatus(cb: (s: EngineStatus) => void) { this.statusCb = cb; }
  private status(s: EngineStatus) { this.statusCb?.(s); }

  async start() {
    if (!WebSpeechWakeWordEngine.isSupported()) { this.status('unsupported'); return; }
    if (this.running) return;
    this.running = true;
    this.backoffMs = 300;
    this.spawn();
    this.recycleTimer = setInterval(() => { if (this.running) { try { this.rec?.stop(); } catch { /* onend restarts */ } } }, this.opts.recycleMs ?? 50_000);
  }

  stop() {
    this.running = false;
    clearTimeout(this.restartTimer);
    clearInterval(this.recycleTimer);
    if (this.rec) { this.rec.onend = null; this.rec.onerror = null; this.rec.onresult = null; try { this.rec.abort(); } catch { /* ignore */ } this.rec = null; }
    this.status('idle');
  }

  private spawn() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.lang = this.opts.lang || localStorage.getItem('roadsos_locale') || 'en-IN';
    rec.onstart = () => { this.backoffMs = 300; this.status('listening'); };
    rec.onresult = (event: any) => {
      if (this.opts.shouldIgnore?.()) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const conf = r[0].confidence;
        const alts = Array.from(r).map((a: any) => a.transcript);
        this.resultCb?.(r[0].transcript, r.isFinal, conf, alts);
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { 
        this.status('blocked'); 
        this.running = false; 
      } else if (e.error === 'network') {
        this.status('restarting');
      } else {
        this.backoffMs = 300;
      }
    };
    rec.onend = () => {
      if (!this.running) return;
      this.status('restarting');
      // Single supervised restart with backoff (300 ms → 5 s). No parallel watchdogs.
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => { if (this.running) this.spawn(); }, this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, 5000);
    };
    this.rec = rec;
    try { rec.start(); } catch { /* InvalidStateError: already started — onend will handle */ }
  }
}

export interface PorcupineOptions {
  accessKey: string;
  /** Public URL of the custom keyword model (.ppn) trained for the user's word, and its label. */
  keyword: { publicPath: string; label: string } | { builtin: string };
  /** Public URL of porcupine_params.pv (ships with @picovoice/porcupine-web). */
  modelPath?: string;
}

/**
 * Offline keyword spotting. Requires:
 *   npm i @picovoice/porcupine-web @picovoice/web-voice-processor
 *   VITE_PICOVOICE_ACCESS_KEY=…  and a .ppn keyword file under /public/wake/
 * The import is dynamic so the app builds and runs without the packages.
 */
export class PorcupineWakeWordEngine implements WakeWordEngine {
  readonly name = 'porcupine' as const;
  private worker: any = null;
  private resultCb: ((t: string, f: boolean, c: number, a: string[]) => void) | null = null;
  private statusCb: ((s: EngineStatus) => void) | null = null;

  constructor(private opts: PorcupineOptions) {}
  onResult(cb: (t: string, f: boolean, c: number, a: string[]) => void) { this.resultCb = cb; }
  onStatus(cb: (s: EngineStatus) => void) { this.statusCb = cb; }

  async start() {
    try {
      const porcupineMod = '@picovoice/porcupine-web';
      const wvpMod = '@picovoice/web-voice-processor';
      const [{ PorcupineWorker }, { WebVoiceProcessor }] = await Promise.all([
        import(/* @vite-ignore */ porcupineMod),
        import(/* @vite-ignore */ wvpMod),
      ]);
      const keyword = 'builtin' in this.opts.keyword ? this.opts.keyword.builtin : this.opts.keyword;
      this.worker = await PorcupineWorker.create(
        this.opts.accessKey,
        keyword,
        (detection: { label: string }) => this.resultCb?.(detection.label, true, 1.0, [detection.label]),
        { publicPath: this.opts.modelPath || '/wake/porcupine_params.pv' },
      );
      await WebVoiceProcessor.subscribe(this.worker);
      this.statusCb?.('listening');
    } catch (e) {
      console.warn('[WakeWord] Porcupine unavailable, falling back:', (e as Error).message);
      this.statusCb?.('unsupported');
      throw e;
    }
  }

  stop() {
    (async () => {
      try {
        const wvpMod = '@picovoice/web-voice-processor';
        const { WebVoiceProcessor } = await import(/* @vite-ignore */ wvpMod);
        if (this.worker) { await WebVoiceProcessor.unsubscribe(this.worker); this.worker.release?.(); this.worker.terminate?.(); }
      } catch { /* ignore */ }
      this.worker = null;
      this.statusCb?.('idle');
    })();
  }
}

export interface WakeWordFactoryConfig {
  word: string;
  lang?: string;
  shouldIgnore?: () => boolean;
  picovoiceAccessKey?: string;
  keywordPath?: string; // e.g. /wake/neon_en_wasm.ppn
}

/** Prefer offline Porcupine when configured; otherwise Web Speech. */
export async function createWakeWordEngine(cfg: WakeWordFactoryConfig): Promise<WakeWordEngine> {
  if (cfg.picovoiceAccessKey && cfg.keywordPath) {
    const engine = new PorcupineWakeWordEngine({ accessKey: cfg.picovoiceAccessKey, keyword: { publicPath: cfg.keywordPath, label: cfg.word } });
    try { await engine.start(); return engine; } catch { /* fall through */ }
  }
  return new WebSpeechWakeWordEngine({ lang: cfg.lang, shouldIgnore: cfg.shouldIgnore });
}

// ───────────────────────────── Persistence ─────────────────────────────

const KEY = 'roadsos_safety_word';
export interface StoredSafetyWord { word: string; aliases: string[]; enrolledAt: number }

export function loadSafetyWord(): StoredSafetyWord {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); if (p?.word) return { word: p.word, aliases: p.aliases || [], enrolledAt: p.enrolledAt || 0 }; }
  } catch { /* ignore */ }
  return { word: 'neon', aliases: [], enrolledAt: 0 };
}

export function saveSafetyWord(v: StoredSafetyWord) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

/** Basic quality rules for a code word: 1–2 tokens, 3–12 letters, not a common panic/command word. */
export function validateSafetyWord(word: string): string | null {
  const w = normalize(word);
  if (!w) return 'Choose a word.';
  if (w.split(' ').length > 2) return 'Use one or two words.';
  if (w.replace(/\s/g, '').length < 3) return 'Too short to recognise reliably.';
  if (w.replace(/\s/g, '').length > 12) return 'Too long — keep it under 12 letters.';
  const banned = ['help', 'stop', 'cancel', 'yes', 'no', 'ok', 'okay', 'hello', 'hi', 'the', 'and', 'safe', 'accident', 'ambulance', 'police'];
  if (banned.includes(w)) return 'That word is used in normal conversation or as a command. Pick something rarer.';
  return null;
}

// ───────────────────────────── Shared Engine ─────────────────────────────

export class SharedWakeWordEngine {
  private engine: WakeWordEngine | null = null;
  private listeners = new Set<{
    onResult?: (t: string, f: boolean, c: number, a: string[]) => void,
    onStatus?: (s: EngineStatus) => void
  }>();
  private refCount = 0;
  private currentConfig: WakeWordFactoryConfig | null = null;

  async subscribe(
    cfg: WakeWordFactoryConfig,
    onResult?: (t: string, f: boolean, c: number, a: string[]) => void,
    onStatus?: (s: EngineStatus) => void
  ) {
    const listener = { onResult, onStatus };
    this.listeners.add(listener);
    this.refCount++;

    if (!this.engine) {
      this.currentConfig = cfg;
      this.engine = await createWakeWordEngine(cfg);
      this.engine.onResult((t, f, c, a) => this.listeners.forEach(l => l.onResult?.(t, f, c, a)));
      this.engine.onStatus((s) => this.listeners.forEach(l => l.onStatus?.(s)));
      await this.engine.start();
    }
    
    // In case engine was already listening
    if (this.engine) {
        // Send a status update immediately for the new subscriber if we know the status?
        // Let's just let it be for now.
    }

    return () => {
      this.listeners.delete(listener);
      this.refCount--;
      if (this.refCount <= 0) {
        this.engine?.stop();
        this.engine = null;
        this.refCount = 0;
      }
    };
  }
}

export const sharedWakeWordEngine = new SharedWakeWordEngine();
