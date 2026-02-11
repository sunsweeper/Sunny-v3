import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAFE_FAIL_MESSAGE =
  "I’m having trouble accessing our pricing details—let me connect you with a human.";

const OUTCOME_TYPES = {
  booked: 'booked_job',
  followup: 'needs_human_followup',
  general: 'general_lead',
};

const DEFAULT_OUTCOME = OUTCOME_TYPES.general;

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

const SERVICE_KEYWORDS = [
  { id: 'solar_panel_cleaning', keywords: ['solar', 'panel', 'pv'] },
  { id: 'roof_cleaning', keywords: ['roof'] },
  { id: 'pressure_washing', keywords: ['pressure', 'driveway', 'patio', 'pavers'] },
  { id: 'soft_washing', keywords: ['soft wash', 'softwash', 'siding', 'stucco'] },
];

function loadJsonFile(filePath) {
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    return { ok: true, data: JSON.parse(contents) };
  } catch (error) {
    return { ok: false, error };
  }
}

function loadKnowledge(knowledgeDir) {
  const companyPath = path.join(knowledgeDir, 'company.json');
  const servicesPath = path.join(knowledgeDir, 'services.json');
  const pricingPath = path.join(knowledgeDir, 'pricing.json');
  const publicPricingReferencePath = path.join(knowledgeDir, 'public_pricing_reference.json');

  const company = loadJsonFile(companyPath);
  const services = loadJsonFile(servicesPath);
  const pricing = loadJsonFile(pricingPath);
  const publicPricingReference = loadJsonFile(publicPricingReferencePath);

  if (!company.ok || !services.ok || !pricing.ok || !publicPricingReference.ok) {
    return {
      ok: false,
      error: company.error || services.error || pricing.error || publicPricingReference.error,
    };
  }

  return {
    ok: true,
    data: {
      company: company.data,
      services: services.data,
      pricing: pricing.data,
      publicPricingReference: publicPricingReference.data,
    },
  };
}

function detectIntent(message) {
  const normalized = message.toLowerCase();

  if (/(book|schedule|appointment|reserve|availability)/.test(normalized)) {
    return 'booking_request';
  }

  if (/(price|quote|cost|estimate|how much)/.test(normalized)) {
    return 'pricing_quote';
  }

  if (/(service|offer|do you|provide|what do you)/.test(normalized)) {
    return 'service_info';
  }

  if (/(call me|text me|follow up|contact|human|representative)/.test(normalized)) {
    return 'followup_request';
  }

  return 'general';
}

function detectServiceId(message) {
  const normalized = message.toLowerCase();
  const match = SERVICE_KEYWORDS.find((entry) =>
    entry.keywords.some((keyword) => normalized.includes(keyword))
  );
  return match ? match.id : null;
}

function extractNumberAfterKeyword(message, keyword) {
  const regex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${keyword})`, 'i');
  const match = message.match(regex);
  return match ? Number(match[1]) : null;
}

function extractNumberWithSqft(message) {
  const match = message.match(/(\d+(?:\.\d+)?)\s*(sq\s?ft|square\s?feet)/i);
  return match ? Number(match[1]) : null;
}

function extractEnumOption(message, options) {
  const normalized = message.toLowerCase();
  return options.find((option) => normalized.includes(option.replace(/_/g, ' '))) || null;
}

function extractPhoneNumber(message) {
  const match = message.match(/(\+?1[\s-]?)?(\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4})/);
  return match ? match[0].trim() : null;
}

function extractName(message) {
  const explicitMatch = message.match(/(?:my name is|this is|i am|i'm)\s+([a-z]+(?:\s+[a-z]+){0,3})/i);
  if (explicitMatch) {
    return explicitMatch[1].trim();
  }

  return null;
}

function extractServiceAddress(message) {
  const match = message.match(
    /\d{1,6}\s+[a-z0-9]+(?:\s+[a-z0-9]+)*\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|circle|cir|place|pl)\b/i
  );
  return match ? match[0].trim() : null;
}

function extractEmail(message) {
  const match = message.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].trim() : null;
}


function extractSlots(message, service) {
  if (!service || !service.required_for_quote) {
    return {};
  }

  const slots = {};
  const normalized = message.toLowerCase();

  for (const requirement of service.required_for_quote) {
    if (requirement.field === 'panel_count') {
      slots.panel_count =
        extractNumberAfterKeyword(message, 'panels?') || extractNumberAfterKeyword(message, 'panel');
    }

    if (requirement.field === 'solar_mounting') {
      slots.solar_mounting = extractEnumOption(normalized, requirement.options);
      if (!slots.solar_mounting) {
        if (normalized.includes('ground')) {
          slots.solar_mounting = 'ground_mount';
        } else if (normalized.includes('second')) {
          slots.solar_mounting = 'second_story_roof';
        } else if (normalized.includes('first')) {
          slots.solar_mounting = 'first_story_roof';
        } else if (normalized.includes('roof')) {
          slots.solar_mounting = 'first_story_roof';
        }
      }
    }

    if (requirement.field === 'water_access') {
      if (/(yes|yeah|yep)/.test(normalized)) {
        slots.water_access = 'yes';
      }
      if (/(no|nope)/.test(normalized)) {
        slots.water_access = 'no';
      }
      if (/(not sure|unsure|don\'t know)/.test(normalized)) {
        slots.water_access = 'not_sure';
      }
    }

    if (requirement.field === 'roof_sqft') {
      slots.roof_sqft = extractNumberWithSqft(message) || extractNumberAfterKeyword(message, 'sqft');
    }

    if (requirement.field === 'roof_type') {
      slots.roof_type = extractEnumOption(normalized, requirement.options);
    }

    if (requirement.field === 'surface_sqft') {
      slots.surface_sqft =
        extractNumberWithSqft(message) || extractNumberAfterKeyword(message, 'sqft');
    }

    if (requirement.field === 'surface_type') {
      if (normalized.includes('driveway')) {
        slots.surface_type = 'driveway';
      } else if (normalized.includes('patio')) {
        slots.surface_type = 'patio';
      } else if (normalized.includes('walkway')) {
        slots.surface_type = 'walkway';
      } else if (normalized.includes('paver')) {
        slots.surface_type = 'pavers';
      }
    }

    if (requirement.field === 'surface_material') {
      if (normalized.includes('stucco')) {
        slots.surface_material = 'stucco';
      } else if (normalized.includes('siding')) {
        slots.surface_material = 'siding';
      } else if (normalized.includes('fence')) {
        slots.surface_material = 'fence';
      }
    }
  }

  return slots;
}

function isRefusal(message) {
  return /(don\'t know|not sure|no idea|can\'t provide|prefer not)/i.test(message);
}

function mergeSlots(existing, incoming) {
  return { ...existing, ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value)) };
}

function getMissingRequiredSlots(service, slots) {
  if (!service || !service.required_for_quote) {
    return [];
  }

  return service.required_for_quote
    .filter((requirement) => requirement.required)
    .filter((requirement) => !slots[requirement.field]);
}

function findServiceById(knowledge, serviceId) {
  return knowledge.services.services.find((service) => service.id === serviceId) || null;
}

function normalizeText(value) {
  return (value || '').toLowerCase();
}

function serviceToKeywords(serviceName) {
  const normalized = normalizeText(serviceName)
    .replace(/[–—]/g, ' ')
    .replace(/[^a-z0-9\s&]/g, ' ');

  const keywordSet = new Set(normalized.split(/\s+/).filter((token) => token.length > 2));
  keywordSet.add(normalized.trim());

  if (normalized.includes('gutter guard')) {
    keywordSet.add('gutter guards');
  }
  if (normalized.includes('bird') || normalized.includes('rodent')) {
    keywordSet.add('critter guard');
    keywordSet.add('solar critter guard');
    keywordSet.add('solar proofing');
  }

  return Array.from(keywordSet);
}

function findPublicServiceMatch(message, publicPricingReference) {
  if (!publicPricingReference || !Array.isArray(publicPricingReference.services)) {
    return null;
  }

  const normalizedMessage = normalizeText(message);

  for (const entry of publicPricingReference.services) {
    const categoryMatch = normalizedMessage.includes(normalizeText(entry.category));
    const keywords = serviceToKeywords(entry.service);
    const serviceMatch = keywords.some((keyword) => keyword && normalizedMessage.includes(keyword));

    if (serviceMatch || categoryMatch) {
      return entry;
    }
  }

  return null;
}

function buildPublicReferenceResponse(entry, askToBook = false) {
  const base = `${entry.service} (${entry.category}): ${entry.public_pricing_positioning}`;
  if (!askToBook) {
    return base;
  }

  return `${base} If you'd like, I can collect a few details and have a human provide a finalized quote.`;
}

function getBusinessHours(company) {
  return company.company.hours_of_operation.schedule;
}


function extractRequestedDate(message) {
  const slashDate = message.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
  if (slashDate) {
    return slashDate[1];
  }

  const longDate = message.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?/i
  );
  if (longDate) {
    return longDate[0];
  }

  return parsePreferredDay(message);
}

function parsePreferredDay(message) {
  const normalized = message.toLowerCase();
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  return days.find((day) => normalized.includes(day)) || null;
}

function parsePreferredTime(message) {
  const match = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3] ? match[3].toLowerCase() : null;

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  let normalizedHours = hours;
  if (meridiem === 'pm' && hours < 12) {
    normalizedHours += 12;
  }
  if (meridiem === 'am' && hours === 12) {
    normalizedHours = 0;
  }

  return `${String(normalizedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function isWithinHours(day, time, schedule) {
  const daySchedule = schedule.find((entry) => entry.day === day);
  if (!daySchedule || !daySchedule.open || !daySchedule.close) {
    return false;
  }

  return time >= daySchedule.open && time <= daySchedule.close;
}

function getPricingForService(knowledge, serviceId) {
  const pricingRules = knowledge.pricing.pricing_rules;
  return pricingRules[serviceId] || null;
}

function calculateSolarPanelPrice(pricingRule, panelCount) {
  const tier = pricingRule.panel_tiers.find(
    (entry) => panelCount >= entry.min && panelCount <= entry.max
  );

  if (!tier) {
    return null;
  }

  if (tier.job_total_usd) {
    return { total: tier.job_total_usd, pricingPath: 'solar_panel_cleaning_flat' };
  }

  if (tier.internal_rate_per_panel) {
    return {
      total: Number((tier.internal_rate_per_panel * panelCount).toFixed(2)),
      pricingPath: 'solar_panel_cleaning_tiered',
    };
  }

  return null;
}

function calculateRoofCleaningPrice(pricingRule, roofType, roofSqft) {
  const method = Object.values(pricingRule.methods).find((entry) =>
    entry.applicable_roof_types.includes(roofType)
  );

  if (!method) {
    return null;
  }

  return {
    total: Number((method.rate_per_sqft * roofSqft).toFixed(2)),
    pricingPath: `roof_cleaning_${method === pricingRule.methods.soft_wash ? 'soft_wash' : 'pressure_wash'}`,
  };
}

function formatCurrency(value, currency) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
}

function buildServiceInfoResponse(service) {
  const includes = service.includes ? `Includes: ${service.includes.join('; ')}.` : '';
  const excludes = service.excludes ? `Excludes: ${service.excludes.join('; ')}.` : '';

  return `${service.short_description} ${includes} ${excludes}`.trim();
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

function updateContactSlots(message, slots) {
  const updated = { ...slots };
  const normalized = message.toLowerCase();

  if (!updated.contact_method) {
    if (normalized.includes('text')) {
      updated.contact_method = 'text';
    }
    if (normalized.includes('call') || normalized.includes('phone')) {
      updated.contact_method = 'call';
    }
  }

  if (!updated.callback_window && /(morning|afternoon|evening|today|tomorrow)/.test(normalized)) {
    updated.callback_window = message.trim();
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

  if (extractedName && !updated.client_name) {
    updated.client_name = extractedName;
  }

  if (extractedPhone && !updated.phone) {
    updated.phone = extractedPhone;
  }

  if (extractedAddress && !updated.address) {
    updated.address = extractedAddress;
  }

  if (extractedEmail && !updated.email) {
    updated.email = extractedEmail;
  }

  if (extractedDate && !updated.requested_date) {
    updated.requested_date = extractedDate;
  }

  if (extractedTime && !updated.time) {
    updated.time = extractedTime;
  }

  return updated;
}

function detectEscalationReason(message) {
  const normalized = message.toLowerCase();

  if (/(guarantee|warranty|exception|custom price|discount|special rate)/.test(normalized)) {
    return 'guarantee_or_custom_pricing_request';
  }

  if (/(unsafe|steep|hazard|no access|cannot access|compliance|permit)/.test(normalized)) {
    return 'safety_or_compliance_concern';
  }

  return null;
}

function getMissingBookingFields(service, slots) {
  const missing = SOLAR_REQUIRED_BOOKING_FIELDS.filter((entry) => !slots[entry.field]);

  const requiredServiceSlots = getMissingRequiredSlots(service, slots);
  return [...missing.map((entry) => entry.field), ...requiredServiceSlots.map((entry) => entry.field)];
}

function buildMissingFieldPrompt(service, missingField) {
  const bookingPrompt = SOLAR_REQUIRED_BOOKING_FIELDS.find((entry) => entry.field === missingField);
  if (bookingPrompt) {
    return bookingPrompt.label;
  }

  if (missingField === 'requested_date') {
    return 'What date would you like to book?';
  }

  if (missingField === 'time') {
    return 'What time works best for you?';
  }

  const requiredSlot = service?.required_for_quote?.find(
    (requirement) => requirement.field === missingField
  );

  return requiredSlot ? requiredSlot.label : 'Could you share a bit more detail?';
}

function buildConversationSummary(state) {
  const parts = [];
  if (state.serviceId) {
    parts.push(`Service: ${state.serviceId}`);
  }
  if (state.slots.panel_count) {
    parts.push(`Panels: ${state.slots.panel_count}`);
  }
  if (state.slots.roof_sqft) {
    parts.push(`Roof sqft: ${state.slots.roof_sqft}`);
  }
  if (state.slots.surface_sqft) {
    parts.push(`Surface sqft: ${state.slots.surface_sqft}`);
  }
  if (state.slots.address) {
    parts.push(`Address: ${state.slots.address}`);
  }
  if (state.slots.requested_date && state.slots.time) {
    parts.push(`Preferred: ${state.slots.requested_date} ${state.slots.time}`);
  }
  return parts.join(' | ');
}

function logOutcome(logger, details) {
  if (logger && typeof logger.info === 'function') {
    logger.info(details);
  }
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
    if (logger && typeof logger.error === 'function') {
      logger.error({ message: 'Failed to write outcome record', error: error.message });
    }
  }
}

function createSunnyRuntime({
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
    if (!knowledgeState.ok) {
      return {
        reply: SAFE_FAIL_MESSAGE,
        state: { ...state, outcome: 'needs_human_followup', needsHumanFollowup: true },
      };
    }

    const knowledge = knowledgeState.data;
    const updatedState = {
      intent: state.intent || null,
      serviceId: state.serviceId || null,
      slots: { ...(state.slots || {}) },
      outcome: state.outcome || DEFAULT_OUTCOME,
      needsHumanFollowup: state.needsHumanFollowup || false,
      escalationReason: state.escalationReason || null,
      intents: Array.isArray(state.intents) ? state.intents : [],
    };

    updatedState.slots = updateContactSlots(message, updatedState.slots);
    updatedState.slots = updateBookingSlots(message, updatedState.slots);

    const detectedIntent = detectIntent(message);
    updatedState.intent = detectedIntent;
    updatedState.intents = Array.from(new Set([...updatedState.intents, detectedIntent]));

    const escalationReason = detectEscalationReason(message);
    if (escalationReason) {
      updatedState.needsHumanFollowup = true;
      updatedState.outcome = OUTCOME_TYPES.followup;
      updatedState.escalationReason = escalationReason;
    }

    const detectedServiceId = detectServiceId(message);
    if (detectedServiceId) {
      updatedState.serviceId = detectedServiceId;
    }

    const service = updatedState.serviceId ? findServiceById(knowledge, updatedState.serviceId) : null;
    const publicServiceMatch = findPublicServiceMatch(message, knowledge.publicPricingReference);

    if (updatedState.needsHumanFollowup || detectedIntent === 'followup_request') {
      updatedState.needsHumanFollowup = true;
      updatedState.outcome = OUTCOME_TYPES.followup;
      const reply = buildEscalationResponse(updatedState);
      logOutcome(logger, {
        intent: detectedIntent,
        outcome: updatedState.outcome,
        pricingPath: null,
        escalationReason: updatedState.escalationReason || 'followup_requested',
      });
      writeOutcomeRecord(
        outcomeLogPath,
        buildOutcomeRecord(updatedState, {
          escalation_reason: updatedState.escalationReason || 'followup_requested',
        }),
        logger
      );
      return { reply, state: updatedState };
    }

    if (detectedIntent === 'service_info' && service) {
      const reply = buildServiceInfoResponse(service);
      logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
      writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
      return { reply, state: updatedState };
    }

    if (detectedIntent === 'service_info' && publicServiceMatch) {
      const reply = buildPublicReferenceResponse(publicServiceMatch);
      logOutcome(logger, {
        intent: detectedIntent,
        outcome: updatedState.outcome,
        pricingPath: 'public_pricing_reference',
      });
      writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
      return { reply, state: updatedState };
    }

    if (detectedIntent === 'pricing_quote' || detectedIntent === 'booking_request') {
      if (!service) {
        if (publicServiceMatch) {
          const reply = buildPublicReferenceResponse(
            publicServiceMatch,
            detectedIntent === 'pricing_quote' || detectedIntent === 'booking_request'
          );
          logOutcome(logger, {
            intent: detectedIntent,
            outcome: updatedState.outcome,
            pricingPath: 'public_pricing_reference',
          });
          writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
          return { reply, state: updatedState };
        }

        const reply = 'Which service are you interested in (solar panel cleaning, roof cleaning, pressure washing, or soft washing)?';
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      const extractedSlots = extractSlots(message, service);
      updatedState.slots = mergeSlots(updatedState.slots, extractedSlots);

      const missingRequired = getMissingRequiredSlots(service, updatedState.slots);

      if (missingRequired.length > 0) {
        if (isRefusal(message)) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = OUTCOME_TYPES.followup;
          updatedState.escalationReason = 'missing_required_fields';
          const reply = buildEscalationResponse(updatedState);
          logOutcome(logger, {
            intent: detectedIntent,
            outcome: updatedState.outcome,
            pricingPath: null,
            escalationReason: updatedState.escalationReason,
          });
          writeOutcomeRecord(
            outcomeLogPath,
            buildOutcomeRecord(updatedState, {
              escalation_reason: updatedState.escalationReason,
            }),
            logger
          );
          return { reply, state: updatedState };
        }

        const nextRequirement = missingRequired[0];
        const reply = nextRequirement.label;
        logOutcome(logger, {
          intent: detectedIntent,
          outcome: updatedState.outcome,
          pricingPath: null,
          missingFields: [nextRequirement.field],
        });
        writeOutcomeRecord(
          outcomeLogPath,
          buildOutcomeRecord(updatedState, { missing_fields: [nextRequirement.field] }),
          logger
        );
        return { reply, state: updatedState };
      }

      if (detectedIntent === 'booking_request') {
        if (service.id !== 'solar_panel_cleaning') {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = OUTCOME_TYPES.followup;
          updatedState.escalationReason = 'non_solar_booking_requires_human';
          const reply = 'I can collect details for that service, but final booking is handled by a human specialist. Would you prefer a text or a call?';
          logOutcome(logger, {
            intent: detectedIntent,
            outcome: updatedState.outcome,
            pricingPath: null,
            escalationReason: updatedState.escalationReason,
          });
          writeOutcomeRecord(
            outcomeLogPath,
            buildOutcomeRecord(updatedState, { escalation_reason: updatedState.escalationReason }),
            logger
          );
          return { reply, state: updatedState };
        }

        const requestedDate = updatedState.slots.requested_date || extractRequestedDate(message);
        const requestedTime = updatedState.slots.time || parsePreferredTime(message);

        if (requestedDate) {
          updatedState.slots.requested_date = requestedDate;
        }
        if (requestedTime) {
          updatedState.slots.time = requestedTime;
        }

        if (!updatedState.slots.location && updatedState.slots.solar_mounting) {
          updatedState.slots.location = updatedState.slots.solar_mounting;
        }

        const missingBookingFields = getMissingBookingFields(service, updatedState.slots);
        if (missingBookingFields.length > 0) {
          const reply = buildMissingFieldPrompt(service, missingBookingFields[0]);
          logOutcome(logger, {
            intent: detectedIntent,
            outcome: updatedState.outcome,
            pricingPath: null,
            missingFields: missingBookingFields,
          });
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
          logOutcome(logger, {
            intent: detectedIntent,
            outcome: updatedState.outcome,
            pricingPath: null,
            missingFields: ['time'],
          });
          writeOutcomeRecord(
            outcomeLogPath,
            buildOutcomeRecord(updatedState, {
              missing_fields: ['time'],
            }),
            logger
          );
          return { reply, state: updatedState };
        }

        updatedState.slots.booking_timestamp = new Date().toISOString();
        updatedState.outcome = OUTCOME_TYPES.booked;
        updatedState.bookingRecord = {
          client_name: updatedState.slots.client_name,
          address: updatedState.slots.address,
          panel_count: updatedState.slots.panel_count,
          location: updatedState.slots.location,
          phone: updatedState.slots.phone,
          email: updatedState.slots.email,
          requested_date: updatedState.slots.requested_date,
          time: updatedState.slots.time,
          booking_timestamp: updatedState.slots.booking_timestamp,
        };

        const reply = `Great—your solar panel cleaning is booked for ${updatedState.slots.requested_date} at ${updatedState.slots.time}. I’ll send this booking through now.`;
        logOutcome(logger, {
          intent: detectedIntent,
          outcome: updatedState.outcome,
          pricingPath: null,
          missingFields: [],
        });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      const pricingRule = getPricingForService(knowledge, service.id);
      if (!pricingRule) {
        updatedState.needsHumanFollowup = true;
        updatedState.outcome = OUTCOME_TYPES.followup;
        updatedState.escalationReason = 'pricing_unavailable';
        const reply = buildEscalationResponse(updatedState);
        logOutcome(logger, {
          intent: detectedIntent,
          outcome: updatedState.outcome,
          pricingPath: null,
          escalationReason: updatedState.escalationReason,
        });
        writeOutcomeRecord(
          outcomeLogPath,
          buildOutcomeRecord(updatedState, { escalation_reason: updatedState.escalationReason }),
          logger
        );
        return { reply, state: updatedState };
      }

      if (service.id === 'solar_panel_cleaning') {
        const panelCount = updatedState.slots.panel_count;
        const maxPanels = pricingRule.escalation_rules.max_panels_for_auto_quote;
        if (panelCount > maxPanels) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = OUTCOME_TYPES.followup;
          updatedState.escalationReason = 'panel_count_exceeds_limit';
          const reply =
            'Large systems require a human review for access, safety, and logistics. I can connect you with a human—would you prefer a text or a call?';
          logOutcome(logger, {
            intent: detectedIntent,
            outcome: updatedState.outcome,
            pricingPath: 'solar_panel_cleaning_escalation',
            escalationReason: updatedState.escalationReason,
          });
          writeOutcomeRecord(
            outcomeLogPath,
            buildOutcomeRecord(updatedState, { escalation_reason: updatedState.escalationReason }),
            logger
          );
          return { reply, state: updatedState };
        }

        const price = calculateSolarPanelPrice(pricingRule, panelCount);
        if (!price) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = OUTCOME_TYPES.followup;
          updatedState.escalationReason = 'pricing_unknown';
          const reply = buildEscalationResponse(updatedState);
          logOutcome(logger, {
            intent: detectedIntent,
            outcome: updatedState.outcome,
            pricingPath: 'solar_panel_cleaning_unknown',
            escalationReason: updatedState.escalationReason,
          });
          writeOutcomeRecord(
            outcomeLogPath,
            buildOutcomeRecord(updatedState, { escalation_reason: updatedState.escalationReason }),
            logger
          );
          return { reply, state: updatedState };
        }

        const total = formatCurrency(price.total, knowledge.pricing.currency);
        const reply = `Your total for solar panel cleaning is ${total}. Would you like to book a time?`;
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: price.pricingPath });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      if (service.id === 'roof_cleaning') {
        const roofSqft = updatedState.slots.roof_sqft;
        const roofType = updatedState.slots.roof_type;
        const price = calculateRoofCleaningPrice(pricingRule, roofType, roofSqft);

        if (!price) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = OUTCOME_TYPES.followup;
          updatedState.escalationReason = 'pricing_unknown';
          const reply = buildEscalationResponse(updatedState);
          logOutcome(logger, {
            intent: detectedIntent,
            outcome: updatedState.outcome,
            pricingPath: 'roof_cleaning_unknown',
            escalationReason: updatedState.escalationReason,
          });
          writeOutcomeRecord(
            outcomeLogPath,
            buildOutcomeRecord(updatedState, { escalation_reason: updatedState.escalationReason }),
            logger
          );
          return { reply, state: updatedState };
        }

        const total = formatCurrency(price.total, knowledge.pricing.currency);
        const reply = `Your total for roof cleaning is ${total}. Would you like to book a time?`;
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: price.pricingPath });
        writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
        return { reply, state: updatedState };
      }

      updatedState.needsHumanFollowup = true;
      updatedState.outcome = OUTCOME_TYPES.followup;
      updatedState.escalationReason = 'unsupported_service';
      const reply = buildEscalationResponse(updatedState);
      logOutcome(logger, {
        intent: detectedIntent,
        outcome: updatedState.outcome,
        pricingPath: 'unsupported_service',
        escalationReason: updatedState.escalationReason,
      });
      writeOutcomeRecord(
        outcomeLogPath,
        buildOutcomeRecord(updatedState, { escalation_reason: updatedState.escalationReason }),
        logger
      );
      return { reply, state: updatedState };
    }

    const reply = "Hey! What's up? 😊";
    logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
    writeOutcomeRecord(outcomeLogPath, buildOutcomeRecord(updatedState), logger);
    return { reply, state: updatedState };
  }

  return { handleMessage };
}

export { SAFE_FAIL_MESSAGE, createSunnyRuntime };
