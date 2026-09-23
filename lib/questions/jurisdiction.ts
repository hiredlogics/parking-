/**
 * Infer UK nation group from parking location text and/or a postcode.
 *
 * PoFA Schedule 4 applies in England and Wales only — so those two are
 * one bucket. Returns null when we cannot be reasonably sure — only then
 * should the customer be asked.
 */

export type UkJurisdiction =
  | "ENGLAND_WALES"
  | "SCOTLAND"
  | "NORTHERN_IRELAND";

/** Outward postcode areas used in Scotland (Royal Mail). */
const SCOTLAND_AREAS = new Set([
  "AB",
  "DD",
  "DG",
  "EH",
  "FK",
  "G",
  "HS",
  "IV",
  "KA",
  "KW",
  "KY",
  "ML",
  "PA",
  "PH",
  "TD",
  "ZE",
]);

const NI_AREA = "BT";

/** Place-name hints when no usable postcode is present. */
const SCOTLAND_PLACES =
  /\b(scotland|edinburgh|glasgow|aberdeen|dundee|inverness|stirling|perth|falkirk|paisley|kilmarnock|dumfries|orkney|shetland|outer\s+hebrides|renfrew|livingston|motherwell|airdrie|coatbridge|greenock|ayr|oban|fort\s+william)\b/i;
const NI_PLACES =
  /\b(northern\s+ireland|belfast|derry|londonderry|lisburn|newry|armagh|omagh|enniskillen|antrim|bangor|coleraine)\b/i;
const ENGLAND_WALES_PLACES =
  /\b(england|wales|london|manchester|birmingham|leeds|liverpool|bristol|sheffield|newcastle|cardiff|swansea|newport|wrexham|brighton|oxford|cambridge|nottingham|leicester|coventry|southampton|portsmouth|reading|milton\s+keynes|croydon|westminster|camden|islington|hackney|tower\s+hamlets|solihull|shirley|warwickshire|west\s+midlands|staffordshire|worcestershire|gloucestershire|hampshire|surrey|kent|essex|sussex|yorkshire|lancashire|cheshire|merseyside|greater\s+manchester|tyne\s+and\s+wear|durham|cumbria|norfolk|suffolk|devon|cornwall|dorset|somerset|wiltshire|berkshire|buckinghamshire|hertfordshire|bedfordshire|northamptonshire|derbyshire|lincolnshire|nottinghamshire|shropshire|herefordshire|powys|gwynedd|anglesey|carmarthenshire|pembrokeshire|bridgend|caerphilly|rhondda|bath|york|hull|plymouth|exeter|bournemouth|poole|basingstoke|guildford|watford|luton|slough|heathrow|gatwick|stansted|birmingham\s+airport|manchester\s+airport|liverpool\s+airport|bristol\s+airport)\b/i;

/**
 * Extract a UK outward area code from free text (e.g. "LS1 2AB" → "LS",
 * "G1 1AA" → "G", "EH12 5AA" → "EH", "B90 4QY" → "B").
 */
export function extractPostcodeArea(text: string): string | null {
  const normalised = text
    .toUpperCase()
    .replace(/[\u2013\u2014-]/g, " ")
    .replace(/\s+/g, " ");
  const m = normalised.match(/\b([A-Z]{1,2})\d[A-Z\d]?\s*\d[A-Z]{2}\b/);
  if (!m) return null;
  return m[1];
}

export function inferUkJurisdiction(
  parkingLocation?: string | null,
  ...extraText: Array<string | null | undefined>
): UkJurisdiction | null {
  const combined = [parkingLocation, ...extraText]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" ")
    .trim();
  if (!combined) return null;

  const area = extractPostcodeArea(combined);
  if (area === NI_AREA) return "NORTHERN_IRELAND";
  if (area && SCOTLAND_AREAS.has(area)) return "SCOTLAND";
  // Any other standard UK outward code → England or Wales.
  if (area) return "ENGLAND_WALES";

  if (NI_PLACES.test(combined)) return "NORTHERN_IRELAND";
  if (SCOTLAND_PLACES.test(combined)) return "SCOTLAND";
  if (ENGLAND_WALES_PLACES.test(combined)) return "ENGLAND_WALES";

  return null;
}
