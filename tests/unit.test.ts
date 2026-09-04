import { describe, it, expect } from 'vitest';

// 1. G-Force Threshold Evaluation
function evaluateGForce(x, y, z) {
  const force = Math.sqrt(x*x + y*y + z*z) / 9.81;
  return force;
}

// 2. Wake-word Matching
function detectWakeWord(transcript, wakeWord = "neon") {
  const cleanTranscript = transcript.toLowerCase().trim();
  const count = (cleanTranscript.match(new RegExp(wakeWord, "g")) || []).length;
  return count >= 3;
}

// 3. ETA-based hospital selection
function selectNearestHospital(hospitals) {
  return hospitals.sort((a, b) => {
    // Assuming ETA is in seconds
    return a.eta - b.eta;
  })[0];
}

// 4. SOS State Machine transition table
const SOS_STATES = {
  NORMAL: "NORMAL",
  DETECTED: "DETECTED",
  VOICE_PROBE: "VOICE_PROBE",
  DISPATCHING: "DISPATCHING",
  CANCELLED: "CANCELLED"
};

function sosTransition(currentState, event) {
  switch (currentState) {
    case SOS_STATES.NORMAL:
      if (event === "IMPACT_DETECTED") return SOS_STATES.DETECTED;
      break;
    case SOS_STATES.DETECTED:
      if (event === "START_PROBE") return SOS_STATES.VOICE_PROBE;
      if (event === "CANCEL") return SOS_STATES.CANCELLED;
      break;
    case SOS_STATES.VOICE_PROBE:
      if (event === "CONFIRM_HELP" || event === "TIMEOUT") return SOS_STATES.DISPATCHING;
      if (event === "CANCEL") return SOS_STATES.CANCELLED;
      break;
    case SOS_STATES.DISPATCHING:
      if (event === "CANCEL") return SOS_STATES.CANCELLED;
      break;
  }
  return currentState; // invalid transition or no change
}

describe('Pure Logic Functions', () => {
  it('evaluateGForce: calculates correctly', () => {
    // 9.81, 0, 0 => 1G
    expect(evaluateGForce(9.81, 0, 0)).toBeCloseTo(1);
    // 39.24 => 4G
    expect(evaluateGForce(39.24, 0, 0)).toBeCloseTo(4);
  });

  it('detectWakeWord: requires exactly or more than 3 occurrences', () => {
    expect(detectWakeWord("neon", "neon")).toBe(false);
    expect(detectWakeWord("neon neon", "neon")).toBe(false);
    expect(detectWakeWord("neon neon neon", "neon")).toBe(true);
    expect(detectWakeWord("neon neon neon neon", "neon")).toBe(true);
    expect(detectWakeWord("Help me neon is not enough", "neon")).toBe(false);
  });

  it('selectNearestHospital: sorts by ETA', () => {
    const hospitals = [
      { name: "Far", eta: 1200 },
      { name: "Near", eta: 300 },
      { name: "Mid", eta: 600 }
    ];
    expect(selectNearestHospital(hospitals).name).toBe("Near");
  });

  it('sosTransition: follows the state machine', () => {
    expect(sosTransition(SOS_STATES.NORMAL, "IMPACT_DETECTED")).toBe(SOS_STATES.DETECTED);
    expect(sosTransition(SOS_STATES.DETECTED, "START_PROBE")).toBe(SOS_STATES.VOICE_PROBE);
    expect(sosTransition(SOS_STATES.VOICE_PROBE, "TIMEOUT")).toBe(SOS_STATES.DISPATCHING);
    expect(sosTransition(SOS_STATES.VOICE_PROBE, "CANCEL")).toBe(SOS_STATES.CANCELLED);
    expect(sosTransition(SOS_STATES.CANCELLED, "IMPACT_DETECTED")).toBe(SOS_STATES.CANCELLED);
  });
});
