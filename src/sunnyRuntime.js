import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SAFE_FAIL_MESSAGE =
  "I’m having trouble accessing our pricing details. Let me connect you with a human.";

const OUTCOME_TYPES = {
  booked: 'booked_job',
  followup: 'needs_human_followup',
  general: 'general_lead',
};

const DEFAULT_OUTCOME = OUTCOME_TYPES.general;
const DEFAULT_CURRENCY = 'USD';

const PRICING_DEBUG_ENABLED = /^(1|true|yes|on)$/i.test(process.env.SUNNY_PRICING_DEBUG || '');
console.log('[SUNNY_RUNTIME_LOADED]', {
  PRICING_DEBUG_ENABLED,
  SUNNY_PRICING_DEBUG: process.env.SUNNY_PRICING_DEBUG,
});

// Only solar pricing is auto-quoted.
// Everything else should be info-only or escalated to human.
const SERVICE_KEYWORDS = [{ id: 'solar_panel_cleaning', keywords: ['solar', 'panel', 'panels', 'pv'] }];

const REQUIRED_CONTACT_FIELDS = ['contact_method', 'callback_window'];

const SOLAR_REQUIRED_BOOKING_FIELDS = [
  { field: 'client_name', label: 'What is your full name?' },
  { field: 'address', label: 'What is the service address?' },
  { field: 'panel_count', label: 'How many solar panels need cleaning?' },
  { field: 'location', label: 'Where are the panels located (roof, ground mount, etc.)?' },
  { field: 'phone', label: 'What is the best phone number to reach you?' },
  { field: 'email', label: 'What is the best email address for your booking confirmation?' },
  { field: 'requested_date', label: 'What date would you like to book?' },
  { field: 'time', label: 'What time would you like to book?' },
];

function loadJsonFile(filePath) {
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    return { ok: true, data: JSON.parse(contents) };
  } catch (error) {
    return { ok: false, error };
  }
}

function pricingDebugLog(...args) {
  if (!PRICING_DEBUG_ENABLED) return;
  console.info('[sunny:pricing]', ...args);
}

/**
 * SINGLE SOURCE OF TRUTH for solar pricing:
 *   src/data/pricing/solar-pricing-v1.json
 */
function loadKnowledge() {
  // Use absolute paths — knowledgeDir param no longer needed
  const companyPath = path.join(process.cwd(), 'knowledge', 'company.json');
  const servicesPath = path.join(process.cwd(), 'knowledge', 'services.json');
  const solarPricingRelPath = path.join('src', 'data', 'pricing', 'solar-pricing-v1.json');
  const solarPricingAbsPath = path.join(process.cwd(), solarPricingRelPath);

  const company = loadJsonFile(companyPath);
  const services = loadJsonFile(servicesPath);
  const solarPricingV1 = loadJsonFile(solarPricingAbsPath);

  pricingDebugLog('Company load result', { path: companyPath, ok: company.ok, error: company.error?.message });
  pricingDebugLog('Services load result', { path: servicesPath, ok: services.ok, error: services.error?.message });
  pricingDebugLog('Solar pricing load result', { path: solarPricingAbsPath, ok: solarPricingV1.ok });

  if (!company.ok || !services.ok || !solarPricingV1.ok) {
    pricingDebugLog('Knowledge load failed — some files missing', {
      companyOk: company.ok,
      servicesOk: services.ok,
      pricingOk: solarPricingV1.ok
    });
    return { ok: false, error: 'One or more knowledge files failed to load' };
  }

  const entryCount = Object.keys(solarPricingV1.data || {}).length;
  pricingDebugLog('Loaded solar pricing file', {
    loaded: true,
    entries: entryCount,
    sampleKeys: Object.keys(solarPricingV1.data || {}).slice(0, 10),
  });

  return {
    ok: true,
    data: {
      company: company.data,
      services: services.data,
      solarPricingV1: solarPricingV1.data,
      solarPricingSource: solarPricingRelPath,
      currency: DEFAULT_CURRENCY,
    },
  };
}

function detectIntent(message) {
  const normalized = (message || '').toLowerCase();

  if (/(book|schedule|appointment|reserve|availability)/.test(normalized)) return 'booking_request';
  if (/(price|quote|cost|estimate|how much)/.test(normalized)) return 'pricing_quote';
  if (/(service|offer|do you|provide|what do you)/.test(normalized)) return 'service_info';
  if (/(call me|text me|follow up|contact|human|representative)/.test(normalized)) return 'followup_request';

  return 'general';
}

function detectServiceId(message) {
  const normalized = (message || '').toLowerCase();
  const match = SERVICE_KEYWORDS.find((entry) =>
    entry.keywords.some((keyword) => normalized.includes(keyword))
  );
  return match ? match.id : null;
}

function extractNumberAfterKeyword(message, keyword) {
  const regex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${keyword})`, 'i');
  const match = (message || '').match(regex);
  return match ? Number(match[1]) : null;
}

function extractPhoneNumber(message) {
  const match = (message || '').match(/(\+?1[\s-]?)?(\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4})/);
  return match ? match[0].trim() : null;
}

function extractName(message) {
  const explicitMatch = (message || '').match(
    /(?:my name is|this is|i am|i'm)\s+([a-z]+(?:\s+[a-z]+){0,3})/i
  );
  return explicitMatch ? explicitMatch[1].trim() : null;
}

function extractServiceAddress(message) {
  const match = (message || '').match(
    /\d{1,6}\s+[a-z0-9]+(?:\s+[a-z0-9]+)*\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|circle|cir|place|pl)\b/i
  );
  return match ? match[0].trim() : null;
}

function extractEmail(message) {
  const match = (message || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].trim() : null;
}

function parsePreferredDay(message) {
  const normalized = (message || '').toLowerCase();
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.find((day) => normalized.includes(day)) || null;
}

function extractRequestedDate(message) {
  const msg = message || '';

  const slashDate = msg.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (slashDate) return slashDate[1];

  const longDate = msg.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b/i
  );
  if (longDate) return longDate[0];

  return parsePreferredDay(msg);
}

function parsePreferredTime(message) {
  const match = (message || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3] ? match[3].toLowerCase() : null;

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  let normalizedHours = hours;
  if (meridiem === 'pm' && hours < 12) normalizedHours += 12;
  if (meridiem === 'am' && hours === 12) normalizedHours = 0;

  return `${String(normalizedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function extractRequestedTimeRaw(message) {
  const match = (message || '').match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
  return match ? match[1].trim() : null;
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toTitleCase(value) {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatTimeFrom24Hour(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) return null;

  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function normalizeWeekday(value) {
  const normalized = (value || '').trim().toLowerCase();
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const match = weekdays.find((day) => normalized === day || normalized.includes(day));
  return match ? toTitleCase(match) : null;
}

function buildOriginalDateTimeText({ requestedDateInput, requestedTimeInput, requestedDate, requestedTime }) {
  if (requestedDateInput && requestedTimeInput) return `${requestedDateInput} at ${requestedTimeInput}`;
  if (requestedDateInput) return requestedDateInput;
  if (requestedDate && requestedTimeInput) return `${requestedDate} at ${requestedTimeInput}`;
  if (requestedDate && requestedTime) return `${requestedDate} at ${requestedTime}`;
  return requestedDateInput || requestedDate || requestedTimeInput || requestedTime || '';
}

function formatRequestedBookingDateTime({
  rawText,
  parsedDate,
  requestedDate,
  requestedTime,
}) {
  if (isValidDate(parsedDate)) {
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parsedDate);
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsedDate);
    return `${weekday} at ${time}`;
  }

  const weekday = normalizeWeekday(requestedDate);
  const normalizedTime = formatTimeFrom24Hour(requestedTime);
  if (weekday && normalizedTime) {
    return `${weekday} at ${normalizedTime}`;
  }

  const requestedDateParsed = requestedDate ? new Date(requestedDate) : null;
  if (isValidDate(requestedDateParsed) && normalizedTime) {
    const parsedWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(requestedDateParsed);
    return `${parsedWeekday} at ${normalizedTime}`;
  }

  return (rawText || '').trim() || requestedDate || requestedTime || '';
}

function isRefusal(message) {
  return /(don\'t know|not sure|no idea|can\'t provide|prefer not)/i.test(message || '');
}

function mergeSlots(existing, incoming) {
  return { ...existing, ...Object.fromEntries(Object.entries(incoming).filter(([, v]) => v)) };
}

function findServiceById(knowledge, serviceId) {
  return knowledge?.services?.services?.find((service) => service.id === serviceId) || null;
}

function getBusinessHours(company) {
  return company?.company?.hours_of_operation?.schedule || [];
}

function isWithinHours(day, time, schedule) {
  const daySchedule = schedule.find((entry) => entry.day === day);
  if (!daySchedule?.open || !daySchedule?.close) return false;
  return time >= daySchedule.open && time <= daySchedule.close;
}

function formatCurrency(value, currency = DEFAULT_CURRENCY) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
}

/**
 * ✅ Exact key lookup only.
 * JSON is a map: { "27": 283.5, ... }
 * If key is missing -> null -> escalation (no math, no fallback).
 */
function calculateSolarPanelPrice(solarPricingV1, panelCount) {
  if (!solarPricingV1 || typeof solarPricingV1 !== 'object') {
    pricingDebugLog('Lookup skipped: pricing table unavailable', { panelCount });
    return null;
  }

  const total = solarPricingV1[String(panelCount)];
  pricingDebugLog('Lookup value for requested panel count', {
    panelCount,
    lookupValue: total,
  });

  if (typeof total !== 'number') return null;

  return {
    total,
    pricingPath: 'src/data/pricing/solar-pricing-v1.json',
  };
}

function extractSolarQuoteSlots(message) {
  const normalized = (message || '').toLowerCase();
  const slots = {};

  slots.panel_count =
    extractNumberAfterKeyword(message, 'panels?') ||
    extractNumberAfterKeyword(message, 'panel') ||
    null;

  if (normalized.includes('ground')) slots.location = 'ground_mount';
  else if (normalized.includes('second')) slots.location = 'second_story_roof';
  else if (normalized.includes('first')) slots.location = 'first_story_roof';
  else if (normalized.includes('roof')) slots.location = 'roof';

  return slots;
}

function updateContactSlots(message, slots) {
  const updated = { ...slots };
  const normalized = (message || '').toLowerCase();

  if (!updated.contact_method) {
    if (normalized.includes('text')) updated.contact_method = 'text';
    if (normalized.includes('call') || normalized.includes('phone')) updated.contact_method = 'call';
  }

  if (!updated.callback_window && /(morning|afternoon|evening|today|tomorrow)/.test(normalized)) {
    updated.callback_window = (message || '').trim();
  }

  return updated;
}

function updateBookingSlots(message, slots) {
  const updated = { ...slots };

  const extractedName = extractName(message);
  const extractedPhone = extractPhoneNumber(message);
  const extractedAddress = extractServiceAddress(message);
  const extractedEmail = extractEmail(message);
  const extractedDate = extractRequestedDate(message);
  const extractedTime = parsePreferredTime(message);

  if (extractedName && !updated.client_name) updated.client_name = extractedName;
  if (extractedPhone && !updated.phone) updated.phone = extractedPhone;
  if (extractedAddress && !updated.address) updated.address = extractedAddress;
  if (extractedEmail && !updated.email) updated.email = extractedEmail;
  if (extractedDate && !updated.requested_date) updated.requested_date = extractedDate;
  if (extractedTime && !updated.time) updated.time = extractedTime;

  return updated;
}

function buildEscalationResponse(state) {
  const missing = REQUIRED_CONTACT_FIELDS.filter((field) => !state.slots[field]);

  if (missing.includes('contact_method')) {
    return 'I can connect you with a human. Would you prefer a text or a call?';
  }
  if (missing.includes('callback_window')) {
    return 'Thanks! What’s a good callback window for them to reach you?';
  }
  return 'Thanks—our team will follow up soon.';
}

function getMissingBookingFields(slots) {
  return SOLAR_REQUIRED_BOOKING_FIELDS.filter((entry) => !slots[entry.field]).map((e) => e.field);
}

function buildMissingFieldPrompt(missingField) {
  const bookingPrompt = SOLAR_REQUIRED_BOOKING_FIELDS.find((entry) => entry.field === missingField);
  return bookingPrompt ? bookingPrompt.label : 'Could you share a bit more detail?';
}

function buildConversationSummary(state) {
  const parts = [];
  if (state.serviceId) parts.push(`Service: ${state.serviceId}`);
  if (state.slots.panel_count) parts.push(`Panels: ${state.slots.panel_count}`);
  if (state.slots.address) parts.push(`Address: ${state.slots.address}`);
  if (state.slots.requested_date && state.slots.time) {
    parts.push(`Preferred: ${state.slots.requested_date} ${state.slots.time}`);
  }
  return parts.join(' | ');
}

function logOutcome(logger, details) {
  if (logger && typeof logger.info === 'function') logger.info(details);
}

function buildOutcomeRecord(state, extra = {}) {
  return {
    timestamp: new Date().toISOString(),
    outcome_type: state.outcome,
    detected_intents: state.intents,
    service_types: state.serviceId ? [state.serviceId] : [],
    collected_fields: state.slots,
    conversation_summary: buildConversationSummary(state),
    ...extra,
  };
}

function writeOutcomeRecord(outcomeLogPath, record, logger) {
  try {
    fs.appendFileSync(outcomeLogPath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    if (logger?.error) logger.error({ message: 'Failed to write outcome record', error: error.message });
  }
}

export function createSunnyRuntime({
  outcomeLogPath = path.join(__dirname, '..', 'outcomes.jsonl'),
  logger = console,
} = {}) {
  const loaded = loadKnowledge();

  const knowledgeState = {
    ok: loaded.ok,
    data: loaded.ok ? loaded.data : null,
  };

  function handleMessage(message, state = {}) {
    console.log('🚨 SUNNY RUNTIME HIT | message:', message.substring(0, 80), 'at', new Date().toISOString());

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
      bookingStatus: state.bookingStatus || 'requested',
      needsHumanFollowup: state.needsHumanFollowup || false,
      intents: Array.isArray(state.intents) ? state.intents : [],
    };

    updatedState.slots = updateContactSlots(message, updatedState.slots);
    updatedState.slots = updateBookingSlots(message, updatedState.slots);

    const detectedIntent = detectIntent(message);
    updatedState.intent = detectedIntent;
    updatedState.intents = Array.from(new Set([...updatedState.intents, detectedIntent]));

    const detectedServiceId = detectServiceId(message);
    if (detectedServiceId) updatedState.serviceId = detectedServiceId;

    const service =
      updatedState.serviceId === 'solar_panel_cleaning'
        ? findServiceById(knowledge, 'solar_panel_cleaning')
        : null;

    if (detectedIntent === 'followup_request') {
      updatedState.needsHumanFollowup = true;
      updatedState.outcome = OUTCOME_TYPES.followup;
      const reply = buildEscalationResponse(updatedState);

      logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
      writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
      return { reply, state: updatedState };
    }

    if (detectedIntent === 'service_info') {
      if (service) {
        const reply =
          service?.short_description ||
          'We provide professional solar panel cleaning for residential and commercial systems.';
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      const reply =
        'We can help with solar panel cleaning. For roof cleaning, pressure washing, soft washing, and other services, I can connect you with a human for details and pricing.';
      logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
      writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
      return { reply, state: updatedState };
    }

    if (detectedIntent === 'pricing_quote' || detectedIntent === 'booking_request') {
      if (!service) {
        updatedState.needsHumanFollowup = true;
        updatedState.outcome = OUTCOME_TYPES.followup;
        const reply =
          'I can auto-quote solar panel cleaning. For other services, a human will finalize pricing—would you prefer a text or a call?';
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      const extractedSlots = extractSolarQuoteSlots(message);
      updatedState.slots = mergeSlots(updatedState.slots, extractedSlots);

      if (!updatedState.slots.panel_count) {
        if (isRefusal(message)) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = OUTCOME_TYPES.followup;
          const reply = buildEscalationResponse(updatedState);
          logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
          writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
          return { reply, state: updatedState };
        }

        const reply = 'How many solar panels need cleaning?';
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      const panelCount = Number(updatedState.slots.panel_count);
      if (!Number.isInteger(panelCount) || panelCount <= 0) {
        const reply = 'How many panels is it? (Just the number is perfect.)';
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      const quote = calculateSolarPanelPrice(knowledge.solarPricingV1, panelCount);

      if (!quote) {
        updatedState.needsHumanFollowup = true;
        updatedState.outcome = OUTCOME_TYPES.followup;
        const reply =
          'Nice solar array! Due to layout concerns and possible complexity surrounding larger systems I need a human to quickly review for access and logistics. Would you prefer a text or a call?';
        logOutcome(logger, {
          intent: detectedIntent,
          outcome: updatedState.outcome,
          pricingPath: knowledge.solarPricingSource,
          escalationReason: 'panel_count_not_in_pricing_table',
        });
        writeOutcomeRecord(
          outcomeLogPath,
          buildOutcomeRecord(updatedState, { escalation_reason: 'panel_count_not_in_pricing_table' }),
          logger
        );
        return { reply, state: updatedState };
      }

      if (detectedIntent === 'pricing_quote') {
        const totalFormatted = formatCurrency(quote.total, knowledge.currency);
        const reply = `For ${panelCount} solar panels, your total is ${totalFormatted}. Would you like to book a time?`;
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: quote.pricingPath });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      const requestedDate = updatedState.slots.requested_date || extractRequestedDate(message);
      const requestedTime = updatedState.slots.time || parsePreferredTime(message);
      const requestedDateRaw = extractRequestedDate(message);
      const requestedTimeRaw = extractRequestedTimeRaw(message);
      if (requestedDate) updatedState.slots.requested_date = requestedDate;
      if (requestedTime) updatedState.slots.time = requestedTime;
      if (requestedDateRaw) updatedState.slots.requested_date_input = requestedDateRaw;
      if (requestedTimeRaw) updatedState.slots.time_input = requestedTimeRaw;

      const missingBookingFields = getMissingBookingFields(updatedState.slots);
      if (missingBookingFields.length > 0) {
        const reply = buildMissingFieldPrompt(missingBookingFields[0]);
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        writeOutcomeRecord(
          outcomeLogPath,
          buildOutcomeRecord(updatedState, { missing_fields: missingBookingFields }),
          logger
        );
        return { reply, state: updatedState };
      }

      const schedule = getBusinessHours(knowledge.company);
      if (!isWithinHours(updatedState.slots.requested_date, updatedState.slots.time, schedule)) {
        const reply = 'That time is outside our business hours. What time within our regular hours works for you?';
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState, { missing_fields: ['time'] }), logger);
        return { reply, state: updatedState };
      }

      updatedState.slots.booking_timestamp = new Date().toISOString();
      updatedState.outcome = OUTCOME_TYPES.booked;
      updatedState.bookingStatus = updatedState.bookingStatus || 'requested';

      updatedState.bookingRecord = {
        service_id: 'solar_panel_cleaning',
        service_name: service?.name || 'Solar Panel Cleaning',
        client_name: updatedState.slots.client_name,
        address: updatedState.slots.address,
        panel_count: panelCount,
        location: updatedState.slots.location,
        phone: updatedState.slots.phone,
        email: updatedState.slots.email,
        requested_date: updatedState.slots.requested_date,
        time: updatedState.slots.time,
        quoted_total: quote.total,
        quoted_total_formatted: formatCurrency(quote.total, knowledge.currency),
        booking_timestamp: updatedState.slots.booking_timestamp,
        pricing_source: knowledge.solarPricingSource,
      };

      const requestedDateTimeOriginalText = buildOriginalDateTimeText({
        requestedDateInput: updatedState.slots.requested_date_input,
        requestedTimeInput: updatedState.slots.time_input,
        requestedDate: updatedState.slots.requested_date,
        requestedTime: updatedState.slots.time,
      });
      const requestedDateTime = formatRequestedBookingDateTime({
        rawText: requestedDateTimeOriginalText,
        requestedDate: updatedState.slots.requested_date,
        requestedTime: updatedState.slots.time,
      });

      const reply =
        updatedState.bookingStatus === 'confirmed'
          ? `Your appointment is confirmed for ${requestedDateTime}.`
          : `Ok, I can confirm that you are on our list for ${requestedDateTime}, and Aaron, one of our live human client success managers will reach out to you to doubly confirm I got everything right.`;
      logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: quote.pricingPath });
      writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
      return { reply, state: updatedState };
    }

    const reply = "Hey! What's up?";
    logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
    writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
    return { reply, state: updatedState };
  }

  return { handleMessage };
}
