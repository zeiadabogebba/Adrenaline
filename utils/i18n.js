const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPPORTED_LANGS = ['en', 'ar'];
const DEFAULT_LANG = 'en';
const RTL_LANGS = new Set(['ar']);

const LOCALES_DIR = path.join(__dirname, '..', 'locales');

// locales/<lang>/<namespace>.json -> dict[namespace], e.g. locales/ar/nav.json -> t('nav.home').
function loadLocale(lang) {
  const dir = path.join(LOCALES_DIR, lang);
  const dict = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    dict[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return dict;
}

const dictionaries = Object.fromEntries(SUPPORTED_LANGS.map((lang) => [lang, loadLocale(lang)]));

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? vars[name] : match));
}

// Falls back to English, then to the key itself, so a missing Arabic string never renders blank.
function translate(lang, key, vars) {
  const value = lookup(dictionaries[lang] || dictionaries[DEFAULT_LANG], key);
  const text = typeof value === 'string' ? value : lookup(dictionaries[DEFAULT_LANG], key);
  return typeof text === 'string' ? interpolate(text, vars) : key;
}

// Plurals: keys hold one/two/few/many/other variants (Arabic uses all of them),
// e.g. t('trips.spotsLeft') -> { one, two, few, many, other }.
function translatePlural(lang, key, count, vars) {
  let category = 'other';
  try { category = new Intl.PluralRules(lang).select(count); } catch (e) { /* unsupported locale */ }
  const node = lookup(dictionaries[lang] || dictionaries[DEFAULT_LANG], key) || lookup(dictionaries[DEFAULT_LANG], key) || {};
  const text = node[category] || node.other || key;
  return interpolate(text, { n: count, ...vars });
}

// Numbers stay Western digits in both languages.
const formatNumber = (n) => Number(n || 0).toLocaleString('en-US');

// Whole objects/arrays (e.g. the FAQ list) for handing to a page script as JSON.
function translateRaw(lang, key) {
  const value = lookup(dictionaries[lang] || dictionaries[DEFAULT_LANG], key);
  return value !== undefined ? value : lookup(dictionaries[DEFAULT_LANG], key);
}

// Server messages (AppError / validation) are written in English at the call site; the
// "serverMessages" table maps each English message to its translation.
function translateMessage(lang, message) {
  if (!dictionaries[lang] || lang === DEFAULT_LANG || typeof message !== 'string' || !message) return message;
  const table = dictionaries[lang].serverMessages || {};
  // Validation errors arrive joined with ". ": translate each part that we know.
  const translateParts = (text) => table[text] || text.split('. ').map((p) => table[p] || table[`${p}.`] || p).join('. ');
  if (table[message]) return table[message];
  for (const [pattern, replacement] of Object.entries(dictionaries[lang].serverMessagePatterns || {})) {
    const match = message.match(new RegExp(`^${pattern}$`));
    if (match) return replacement.replace(/\$(\d)/g, (m, i) => translateParts(match[Number(i)] || ''));
  }
  return translateParts(message);
}

// Client scripts only get the namespaces they use, served as a small cacheable script.
const CLIENT_NAMESPACES = ['nav', 'js'];
const pick = (dict) => Object.fromEntries(CLIENT_NAMESPACES.map((ns) => [ns, dict[ns] || {}]));
const clientBundles = {};
const clientVersions = {};
for (const lang of SUPPORTED_LANGS) {
  const payload = JSON.stringify({ lang, dir: RTL_LANGS.has(lang) ? 'rtl' : 'ltr', dict: pick(dictionaries[lang]), fallback: pick(dictionaries[DEFAULT_LANG]) })
    .replace(/</g, '\\u003c');
  clientBundles[lang] = `window.I18N=${payload};`
    + '(function(){var I=window.I18N;'
    + 'function g(d,k){return k.split(".").reduce(function(n,p){return n&&typeof n==="object"?n[p]:undefined;},d);}'
    + 'function fill(s,v){return v?s.replace(/\\{(\\w+)\\}/g,function(m,n){return v[n]!==undefined?v[n]:m;}):s;}'
    + 'window.t=function(k,v){var s=g(I.dict,k);if(typeof s!=="string")s=g(I.fallback,k);return typeof s==="string"?fill(s,v):k;};'
    + 'window.tp=function(k,n,v){var c="other";try{c=new Intl.PluralRules(I.lang).select(n);}catch(e){}'
    + 'var o=g(I.dict,k)||g(I.fallback,k)||{};var s=o[c]||o.other||k;var a={n:n};for(var x in v)a[x]=v[x];return fill(s,a);};'
    + 'window.fmtNum=function(n){return Number(n||0).toLocaleString("en-US");};'
    // Arabic month names, Western digits.
    + 'window.dateLocale=I.lang==="ar"?"ar-EG-u-nu-latn":"en-US";'
    + '})();';
  clientVersions[lang] = crypto.createHash('md5').update(clientBundles[lang]).digest('hex').slice(0, 10);
}

// Egyptian place names (package cities, trip locations, city guides) from locales/<lang>/places.json.
function place(lang, name) {
  if (!name || !dictionaries[lang]) return name;
  const table = dictionaries[lang].places || {};
  return table[String(name).trim()] || name;
}

const MONTH_WORD = String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?`;
const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Free-text dates typed in English by the admin ("Nov 15, 2026", "Nov 15 - 18, 2026"):
// swap in the month names from common.months, using day-month-year order for a plain date.
function localizeDateText(lang, text) {
  const months = dictionaries[lang] && lang !== DEFAULT_LANG && translateRaw(lang, 'common.months');
  if (!Array.isArray(months) || typeof text !== 'string' || !text) return text;
  const monthName = (word) => months[MONTH_INDEX[word.slice(0, 3).toLowerCase()]];
  const plain = text.trim().match(new RegExp(`^${MONTH_WORD} (\\d{1,2}),? (\\d{4})$`, 'i'));
  if (plain) return `${plain[2]} ${monthName(plain[1])} ${plain[3]}`;
  return text.replace(new RegExp(`\\b${MONTH_WORD}(?![A-Za-z])`, 'gi'), (m, word) => monthName(word)).replace(/,/g, '،');
}

const PACKAGE_FIELDS = ['name', 'city', 'description'];
const TRIP_FIELDS = ['title', 'location', 'description', 'highlights', 'includedServices', 'durationText', 'itinerary', 'date'];
const PLACE_FIELDS = new Set(['city', 'location']);

// Trips and packages keep Arabic copies of their text fields under `ar`; use them when present,
// and fall back to the place-name table for city/location. Returns a plain object.
function localizeDoc(doc, lang, fields) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (!dictionaries[lang] || lang === DEFAULT_LANG) return obj;
  const ar = obj.ar || {};
  for (const field of fields) {
    const value = ar[field];
    const filled = Array.isArray(value)
      ? value.some((row) => row && Object.entries(row).some(([k, v]) => k !== '_id' && k !== 'day' && typeof v === 'string' && v.trim()))
      : typeof value === 'string' && value.trim() !== '';
    if (filled) obj[field] = value;
    else if (PLACE_FIELDS.has(field)) obj[field] = place(lang, obj[field]);
    else if (field === 'date') obj[field] = localizeDateText(lang, obj[field]);
  }
  return obj;
}

const localizePackage = (doc, lang) => localizeDoc(doc, lang, PACKAGE_FIELDS);
const localizeTrip = (doc, lang) => localizeDoc(doc, lang, TRIP_FIELDS);

module.exports = {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  RTL_LANGS,
  translate,
  translateRaw,
  translatePlural,
  formatNumber,
  translateMessage,
  clientBundles,
  clientVersions,
  place,
  localizeDateText,
  localizeDoc,
  localizePackage,
  localizeTrip,
};
