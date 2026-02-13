async handleMessage(message, ...otherStuff) {
  console.log('🚨 [SUNNY-RUNTIME-MARKER] handleMessage received:', 
    message.substring(0, 120), 
    'at', new Date().toISOString()
  );

  // ──────────────────────────────────────────────────────────────
  // Everything below this line is unchanged from your original code
  // ──────────────────────────────────────────────────────────────

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
  function loadKnowledge(knowledgeDir) {
    const companyPath = path.join(knowledgeDir, 'company.json');
    const servicesPath = path.join(knowledgeDir, 'services.json');

    // ✅ Deterministic path in Vercel/Node
    const solarPricingRelPath = path.join('src', 'data', 'pricing', 'solar-pricing-v1.json');
    const solarPricingAbsPath = path.join(process.cwd(), solarPricingRelPath);

    const company = loadJsonFile(companyPath);
    const services = loadJsonFile(servicesPath);
    const solarPricingV1 = loadJsonFile(solarPricingAbsPath);

    if (solarPricingV1.ok) {
      const entryCount =
        solarPricingV1.data && typeof solarPricingV1.data === 'object'
          ? Object.keys(solarPricingV1.data).length
          : 0;

      pricingDebugLog('Loaded solar pricing file', {
        path: solarPricingRelPath,
        absPath: solarPricingAbsPath,
        loaded: true,
        entries: entryCount,
        sampleKeys: Object.keys(solarPricingV1.data || {}).slice(0, 10),
      });
    } else {
      pricingDebugLog('Failed to load solar pricing file', {
        path: solarPricingRelPath,
        absPath: solarPricingAbsPath,
        loaded: false,
        error: solarPricingV1.error?.message || String(solarPricingV1.error),
      });
    }

    if (!company.ok || !services.ok) {
      return {
        ok: false,
        error: company.error || services.error,
      };
    }

    return {
      ok: true,
      data: {
        company: company.data,
        services: services.data,
        solarPricingV1: solarPricingV1.ok ? solarPricingV1.data : null,
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
      conversation_summary: build
