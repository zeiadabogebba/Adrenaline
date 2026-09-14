const { SUPPORTED_LANGS, DEFAULT_LANG, RTL_LANGS, translate, translateRaw, translatePlural, translateMessage, formatNumber, clientVersions, place } = require('../utils/i18n');

const COOKIE = 'lang';
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

// The admin panel stays English regardless of the visitor's language choice.
const isAdminPath = (p) => p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin');

function refererPath(req) {
  try { return new URL(req.get('Referer')).pathname; } catch (e) { return ''; }
}

function pickLanguage(req) {
  // API calls made from admin pages (e.g. /api/packages) answer in English too.
  if (isAdminPath(req.path) || (req.path.startsWith('/api') && isAdminPath(refererPath(req)))) return DEFAULT_LANG;
  const cookies = req.cookies || {};
  if (SUPPORTED_LANGS.includes(cookies[COOKIE])) return cookies[COOKIE];
  // First visit: follow the browser's preferred language when it is Arabic.
  return /^ar\b/i.test(req.get('Accept-Language') || '') ? 'ar' : DEFAULT_LANG;
}

function urlWithout(req, param) {
  const url = new URL(req.originalUrl, 'http://local');
  url.searchParams.delete(param);
  return url.pathname + url.search;
}

const i18n = (req, res, next) => {
  // ?lang=ar|en on a page link: remember the choice and reload the clean URL.
  const requested = req.query.lang;
  if (req.method === 'GET' && SUPPORTED_LANGS.includes(requested) && !req.path.startsWith('/api')) {
    res.cookie(COOKIE, requested, { maxAge: ONE_YEAR, sameSite: 'lax' });
    return res.redirect(urlWithout(req, 'lang'));
  }

  const lang = pickLanguage(req);
  const otherLang = lang === 'ar' ? 'en' : 'ar';
  const switchUrl = new URL(req.originalUrl, 'http://local');
  switchUrl.searchParams.set('lang', otherLang);

  req.lang = lang;
  req.t = (key, vars) => translate(lang, key, vars);

  res.locals.lang = lang;
  res.locals.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
  res.locals.t = req.t;
  res.locals.place = (name) => place(lang, name);
  res.locals.tRaw = (key) => translateRaw(lang, key);
  res.locals.tp = (key, count, vars) => translatePlural(lang, key, count, vars);
  res.locals.money = (amount) => translate(lang, 'common.money', { amount: formatNumber(amount) });
  res.locals.otherLang = otherLang;
  res.locals.langSwitchHref = switchUrl.pathname + switchUrl.search;
  res.locals.i18nScript = `/i18n/${lang}.js?v=${clientVersions[lang]}`;
  next();
};

// API responses carry English `message` strings from controllers, validators and the rate
// limiters; translate them on the way out. Mounted before the rate limiters so theirs are covered.
const translateJsonMessages = (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body.message === 'string') {
      body = { ...body, message: translateMessage(req.lang || pickLanguage(req), body.message) };
    }
    return json(body);
  };
  next();
};

module.exports = i18n;
module.exports.translateJsonMessages = translateJsonMessages;
