import { describe, it, expect } from 'vitest';

describe('Traffic System: Congestion Ratio Classification', () => {
  const classify = (avgSpeed: number, freeFlow: number) => {
    const ratio = avgSpeed / freeFlow;
    if (ratio >= 0.75) return 'Low';
    if (ratio >= 0.4) return 'Moderate';
    return 'High';
  };

  it('classifies highway at 70 km/h (freeflow 80) as Low', () => {
    expect(classify(70, 80)).toBe('Low');
  });

  it('classifies highway at 40 km/h (freeflow 80) as Moderate', () => {
    expect(classify(40, 80)).toBe('Moderate');
  });

  it('classifies highway at 25 km/h (freeflow 80) as High', () => {
    expect(classify(25, 80)).toBe('High');
  });

  it('classifies residential at 20 km/h (freeflow 25) as Low', () => {
    expect(classify(20, 25)).toBe('Low');
  });

  it('classifies residential at 8 km/h (freeflow 25) as High', () => {
    expect(classify(8, 25)).toBe('High');
  });
});

describe('Traffic System: Sparse Data Fallback', () => {
  it('labels segment as estimated when sample count < 3', () => {
    const dataSource = (sampleCount: number) => sampleCount >= 3 ? 'live' : 'estimated';
    expect(dataSource(0)).toBe('estimated');
    expect(dataSource(2)).toBe('estimated');
    expect(dataSource(3)).toBe('live');
    expect(dataSource(50)).toBe('live');
  });
});

describe('Traffic System: Probe Outlier Filtering', () => {
  it('rejects speeds above 200 km/h', () => {
    const isValid = (speed: number) => speed >= 0 && speed <= 200;
    expect(isValid(250)).toBe(false);
    expect(isValid(-5)).toBe(false);
    expect(isValid(80)).toBe(true);
    expect(isValid(0)).toBe(true);
  });
});

describe('Traffic System: Crowd Report Expiry', () => {
  it('extends expiry by 30 min on confirmation, capped at 4 hours', () => {
    const createdAt = Date.now();
    const maxExpiry = createdAt + 4 * 60 * 60 * 1000;
    let expiresAt = createdAt + 90 * 60 * 1000;

    // First confirmation
    expiresAt = Math.min(expiresAt + 30 * 60 * 1000, maxExpiry);
    expect(expiresAt).toBe(createdAt + 120 * 60 * 1000);
    
    // Many confirmations should cap
    for (let i = 0; i < 20; i++) {
      expiresAt = Math.min(expiresAt + 30 * 60 * 1000, maxExpiry);
    }
    expect(expiresAt).toBe(maxExpiry);
  });
});
