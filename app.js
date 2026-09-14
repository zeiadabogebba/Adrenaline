require('dotenv').config();

const express       = require('express');
const path          = require('path');
const helmet        = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit     = require('express-rate-limit');
const cookieParser  = require('cookie-parser');

const connectDatabase = require('./config/database');
const errorHandler    = require('./middleware/errorHandler');
const i18n            = require('./middleware/i18n');
const AppError        = require('./utils/AppError');

const authRoutes        = require('./routes/authRoutes');
const userRoutes        = require('./routes/userRoutes');
const packageRoutes     = require('./routes/packageRoutes');
const tripRoutes        = require('./routes/tripRoutes');
const tripRequestRoutes = require('./routes/tripRequestRoutes');
const bookingRoutes     = require('./routes/bookingRoutes');
const reviewRoutes      = require('./routes/reviewRoutes');
const contactRoutes     = require('./routes/contactRoutes');
const adminRoutes       = require('./routes/adminRoutes');
const externalRoutes    = require('./routes/externalRoutes');
const avatarRoutes      = require('./routes/avatarRoutes');
const i18nRoutes        = require('./routes/i18nRoutes');
const pageRoutes        = require('./routes/pageRoutes');

const app = express();

// Behind one reverse proxy (Northflank's load balancer). Without this, req.ip
// is the proxy's address, so every visitor shares one rate-limit bucket.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(mongoSanitize());
app.use(cookieParser());
app.use('/api', i18n.translateJsonMessages);
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { status: 'fail', message: 'Too many requests.' } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(i18n);
app.use('/i18n', i18nRoutes);

app.use('/api/auth',         authRoutes);
app.use('/api/users',        userRoutes);
app.use('/api/packages',     packageRoutes);
app.use('/api/trips',        tripRoutes);
app.use('/api/trip-requests', tripRequestRoutes);
app.use('/api/bookings',     bookingRoutes);
app.use('/api/reviews',      reviewRoutes);
app.use('/api/contact',      contactRoutes);
app.use('/api/admin',        adminRoutes);
app.use('/api/external',     externalRoutes);
app.use('/avatars',          avatarRoutes);
app.use('/',                 pageRoutes);

app.use((req, res, next) => next(new AppError(`Route ${req.originalUrl} not found`, 404)));
app.use(errorHandler);

connectDatabase()
  .then(() => {
    console.log('Connected to MongoDB successfully');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

module.exports = app;
