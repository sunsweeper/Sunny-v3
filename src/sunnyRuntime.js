const fs = require('fs');
const path = require('path');

const SAFE_FAIL_MESSAGE =
  "I’m having trouble accessing our pricing details—let me connect you with a human.";

const DEFAULT_OUTCOME = 'general_lead';

const REQUIRED_CONTACT_FIELDS = ['contact_method', 'callback_window'];

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

  const company = loadJsonFile(companyPath);
  const services = loadJsonFile(servicesPath);
  const pricing = loadJsonFile(pricingPath);

  if (!company.ok || !services.ok || !pricing.ok) {
    return { ok: false, error: company.error || services.error || pricing.error };
  }

  return {
    ok: true,
    data: {
      company: company.data,
      services: services.data,
      pricing: pricing.data,
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

function getBusinessHours(company) {
  return company.company.hours_of_operation.schedule;
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

function logOutcome(logger, details) {
  if (logger && typeof logger.info === 'function') {
    logger.info(details);
  }
}

function createSunnyRuntime({ knowledgeDir = path.join(__dirname, '..', 'knowledge'), logger = console } = {}) {
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
    };

    updatedState.slots = updateContactSlots(message, updatedState.slots);

    const detectedIntent = detectIntent(message);
    updatedState.intent = detectedIntent;

    const detectedServiceId = detectServiceId(message);
    if (detectedServiceId) {
      updatedState.serviceId = detectedServiceId;
    }

    const service = updatedState.serviceId ? findServiceById(knowledge, updatedState.serviceId) : null;

    if (updatedState.needsHumanFollowup || detectedIntent === 'followup_request') {
      updatedState.needsHumanFollowup = true;
      updatedState.outcome = 'needs_human_followup';
      const reply = buildEscalationResponse(updatedState);
      logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
      return { reply, state: updatedState };
    }

    if (detectedIntent === 'service_info' && service) {
      const reply = buildServiceInfoResponse(service);
      logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
      return { reply, state: updatedState };
    }

    if (detectedIntent === 'pricing_quote' || detectedIntent === 'booking_request') {
      if (!service) {
        const reply = 'Which service are you interested in (solar panel cleaning, roof cleaning, pressure washing, or soft washing)?';
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        return { reply, state: updatedState };
      }

      const extractedSlots = extractSlots(message, service);
      updatedState.slots = mergeSlots(updatedState.slots, extractedSlots);

      const missingRequired = getMissingRequiredSlots(service, updatedState.slots);

      if (missingRequired.length > 0) {
        if (isRefusal(message)) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = 'needs_human_followup';
          const reply = buildEscalationResponse(updatedState);
          logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
          return { reply, state: updatedState };
        }

        const nextRequirement = missingRequired[0];
        const reply = nextRequirement.label;
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        return { reply, state: updatedState };
      }

      if (detectedIntent === 'booking_request') {
        const preferredDay = updatedState.slots.preferred_day || parsePreferredDay(message);
        const preferredTime = updatedState.slots.preferred_time || parsePreferredTime(message);

        if (!preferredDay) {
          const reply = 'What day of the week would you like to schedule?';
          logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
          return { reply, state: updatedState };
        }

        if (!preferredTime) {
          const reply = 'What time works best for you?';
          logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
          return { reply, state: updatedState };
        }

        updatedState.slots.preferred_day = preferredDay;
        updatedState.slots.preferred_time = preferredTime;

        const schedule = getBusinessHours(knowledge.company);
        if (!isWithinHours(preferredDay, preferredTime, schedule)) {
          const reply = 'That time is outside our business hours. What time within our regular hours works for you?';
          logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
          return { reply, state: updatedState };
        }

        updatedState.outcome = 'booked';
        const reply = `Great—I've noted your booking request for ${preferredDay} at ${preferredTime}. A human will confirm the details shortly.`;
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        return { reply, state: updatedState };
      }

      const pricingRule = getPricingForService(knowledge, service.id);
      if (!pricingRule) {
        updatedState.needsHumanFollowup = true;
        updatedState.outcome = 'needs_human_followup';
        const reply = buildEscalationResponse(updatedState);
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
        return { reply, state: updatedState };
      }

      if (service.id === 'solar_panel_cleaning') {
        const panelCount = updatedState.slots.panel_count;
        const maxPanels = pricingRule.escalation_rules.max_panels_for_auto_quote;
        if (panelCount > maxPanels) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = 'needs_human_followup';
          const reply =
            'Large systems require a human review for access, safety, and logistics. I can connect you with a human—would you prefer a text or a call?';
          logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: 'solar_panel_cleaning_escalation' });
          return { reply, state: updatedState };
        }

        const price = calculateSolarPanelPrice(pricingRule, panelCount);
        if (!price) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = 'needs_human_followup';
          const reply = buildEscalationResponse(updatedState);
          logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: 'solar_panel_cleaning_unknown' });
          return { reply, state: updatedState };
        }

        const total = formatCurrency(price.total, knowledge.pricing.currency);
        const reply = `Your total for solar panel cleaning is ${total}. Would you like to book a time?`;
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: price.pricingPath });
        return { reply, state: updatedState };
      }

      if (service.id === 'roof_cleaning') {
        const roofSqft = updatedState.slots.roof_sqft;
        const roofType = updatedState.slots.roof_type;
        const price = calculateRoofCleaningPrice(pricingRule, roofType, roofSqft);

        if (!price) {
          updatedState.needsHumanFollowup = true;
          updatedState.outcome = 'needs_human_followup';
          const reply = buildEscalationResponse(updatedState);
          logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: 'roof_cleaning_unknown' });
          return { reply, state: updatedState };
        }

        const total = formatCurrency(price.total, knowledge.pricing.currency);
        const reply = `Your total for roof cleaning is ${total}. Would you like to book a time?`;
        logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: price.pricingPath });
        return { reply, state: updatedState };
      }

      updatedState.needsHumanFollowup = true;
      updatedState.outcome = 'needs_human_followup';
      const reply = buildEscalationResponse(updatedState);
      logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: 'unsupported_service' });
      return { reply, state: updatedState };
    }

    const reply = 'How can I help with SunSweeper services or a quote today?';
    logOutcome(logger, { intent: detectedIntent, outcome: updatedState.outcome, pricingPath: null });
    return { reply, state: updatedState };
  }

  return { handleMessage };
}

module.exports = {
  createSunnyRuntime,
};
