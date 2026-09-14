const AppError = require('../utils/AppError');
const { translateMessage } = require('../utils/i18n');

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status     = err.status     || 'error';

  if (err.name === 'CastError')         err = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  if (err.code === 11000)               err = new AppError(`Duplicate value for field: ${Object.keys(err.keyValue)[0]}.`, 400);
  if (err.name === 'ValidationError')   err = new AppError(`Invalid input: ${Object.values(err.errors).map(e => e.message).join('. ')}`, 400);
  if (err.name === 'JsonWebTokenError') err = new AppError('Invalid token. Please log in again.', 401);
  if (err.name === 'TokenExpiredError') err = new AppError('Token expired. Please log in again.', 401);

  const message = translateMessage(req.lang, err.message);

  if (req.path.startsWith('/api')) {
    return res.status(err.statusCode).json({ status: err.status, message });
  }

  if (err.statusCode === 401) {
    const back = req.method === 'GET' && req.originalUrl && !req.originalUrl.startsWith('/login')
      ? '?redirect=' + encodeURIComponent(req.originalUrl)
      : '';
    return res.redirect('/login' + back);
  }
  if (err.statusCode === 403) return res.status(403).render('error403', { message });
  if (err.statusCode === 404) return res.status(404).render('error404', { message });
  return res.status(500).render('error500', { message });
};

module.exports = errorHandler;
