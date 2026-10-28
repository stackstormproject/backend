const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const requestLogger = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const corsOptions = require('./config/cors');
const { MEDIA_ROUTE, UPLOAD_DIR } = require('./config/storage');

const app = express();
// Trust reverse proxy chain (ALB, Nginx, Cloudflare) so req.ip extracts the real client IP
app.set('trust proxy', true);

app.use(helmet());
app.use(cors(corsOptions));
// Stripe signs the exact request bytes, so the webhook must see the raw body.
// express.raw marks the body as parsed, so express.json below skips these paths.
app.use(
  ['/api/payments/webhook', '/api/v1/payments/webhook'],
  express.raw({ type: 'application/json', limit: '1mb' })
);
app.use(express.json({ limit: '10kb' }));
// Product images uploaded to local disk (#172). Read-only; unknown files fall through to 404.
app.use(
  MEDIA_ROUTE,
  helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }),
  express.static(UPLOAD_DIR, { maxAge: '7d', index: false, dotfiles: 'deny' })
);
app.use(cookieParser());
app.use(requestLogger);
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
