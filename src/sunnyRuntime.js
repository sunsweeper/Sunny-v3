import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAFE_FAIL_MESSAGE =
  "I’m having trouble accessing our pricing details. Let me connect you with a human.";

const OUTCOME_TYPES = {
  booked: 'booked_job',
  followup: 'needs_human_followup',
  general: 'general_lead',
};

// ... (keep ALL your constants, functions, helpers exactly as they were)
// paste your original detectIntent, extractNumberAfterKeyword, calculateSolarPanelPrice, etc. here
// (I'm not repeating the huge block to save space — just insert your original code from const DEFAULT_OUTCOME down to writeOutcomeRecord)

export function createSunnyRuntime({
  knowledgeDir = path.join(__dirname, '..', 'knowledge'),
  outcomeLogPath = path.join(__dirname, '..', 'outcomes.jsonl'),
  logger = console,
} = {}) {
  const loaded = loadKnowledge(knowledgeDir);

  const knowledgeState = {
    ok: loaded.ok,
    data: loaded.ok ? loaded.data : null,
  };

  function handleMessage(message, state = {}) {
    // ──────────────────────────────────────────────────────────────
    // Marker log — now in the correct place
    // ──────────────────────────────────────────────────────────────
    console.log('🚨 [SUNNY-RUNTIME-MARKER] handleMessage received:', 
      message.substring(0, 120), 
      'at', new Date().toISOString()
    );

    // ──────────────────────────────────────────────────────────────
    // Everything below is your original handleMessage body — unchanged
    // ──────────────────────────────────────────────────────────────

    if (!knowledgeState.ok) {
      return {
        reply: SAFE_FAIL_MESSAGE,
        state: { ...state, outcome: OUTCOME_TYPES.followup, needsHumanFollowup: true },
      };
    }

    const knowledge = knowledgeState.data;

    const updatedState = {
      intent: state.intent || null,
      serviceId: state.serviceId || null,
      slots: { ...(state.slots || {}) },
      outcome: state.outcome || DEFAULT_OUTCOME,
      needsHumanFollowup: state.needsHumanFollowup || false,
      intents: Array.isArray(state.intents) ? state.intents : [],
    };

    // ... rest of your original handleMessage logic (update slots, detect intent, pricing, booking, etc.)
    // paste the full body here from your original file

    // Make sure the function returns { reply, state } at the end paths
  }

  return { handleMessage };
}
