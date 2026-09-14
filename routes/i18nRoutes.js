const express = require('express');
const router = express.Router();
const { SUPPORTED_LANGS, clientBundles } = require('../utils/i18n');

// Translations for client scripts. The URL carries a content hash, so it can be cached hard.
router.get('/:file', (req, res, next) => {
  const lang = req.params.file.replace(/\.js$/, '');
  if (!SUPPORTED_LANGS.includes(lang)) return next();
  res.set({
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  res.send(clientBundles[lang]);
});

module.exports = router;
