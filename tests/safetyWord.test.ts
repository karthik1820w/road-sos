import { describe, it, expect } from 'vitest';
import { SafetyWordMatcher, validateSafetyWord } from '../src/safety/wakeWord';

describe('SafetyWordMatcher', () => {
  it('triggers on the word said three times as short utterances', () => {
    const m = new SafetyWordMatcher({ word: 'neon' });
    expect(m.feed('neon', true, 1000).triggered).toBe(false);
    expect(m.feed('Neon.', true, 2500).triggered).toBe(false);
    const r = m.feed('neon', true, 4000);
    expect(r.triggered).toBe(true);
    expect(r.count).toBe(3);
  });

  it('triggers when all three are in one short final', () => {
    const m = new SafetyWordMatcher({ word: 'neon' });
    expect(m.feed('neon neon neon', true, 1000).triggered).toBe(true);
  });

  it('does NOT count sound-alikes or the word buried in a sentence', () => {
    const m = new SafetyWordMatcher({ word: 'neon' });
    expect(m.feed('beyond the new one there is leon', true, 1000).count).toBe(0);
    expect(m.feed('I saw a neon sign at the neon shop near the neon bar yesterday', true, 2000).count).toBe(0);
  });

  it('does not double count interim + final of the same utterance', () => {
    const m = new SafetyWordMatcher({ word: 'neon' });
    m.feed('neon', false, 1000);
    m.feed('neon neon', false, 1200);
    const r = m.feed('neon neon', true, 1400);
    expect(r.triggered).toBe(false);
    expect(r.count).toBe(2);
  });

  it('forgets hits outside the window', () => {
    const m = new SafetyWordMatcher({ word: 'neon', windowMs: 5000 });
    m.feed('neon', true, 0);
    m.feed('neon', true, 1000);
    expect(m.feed('neon', true, 9000).triggered).toBe(false);
  });

  it('accepts enrolled aliases and two-word code phrases', () => {
    const m = new SafetyWordMatcher({ word: 'code red', aliases: ['cold red'] });
    m.feed('code red', true, 0);
    m.feed('cold red', true, 500);
    expect(m.feed('code red', true, 1000).triggered).toBe(true);
  });

  it('resets after a trigger', () => {
    const m = new SafetyWordMatcher({ word: 'neon' });
    m.feed('neon neon neon', true, 0);
    expect(m.feed('neon', true, 100).count).toBe(1);
  });
});

describe('validateSafetyWord', () => {
  it('rejects command words and bad lengths', () => {
    expect(validateSafetyWord('help')).not.toBeNull();
    expect(validateSafetyWord('ok')).not.toBeNull();
    expect(validateSafetyWord('a very long phrase here')).not.toBeNull();
    expect(validateSafetyWord('neon')).toBeNull();
    expect(validateSafetyWord('blue tiger')).toBeNull();
  });
});
