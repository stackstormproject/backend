const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const app = express();
if (process.env.NODE_ENV === 'production') {
app.set('trust proxy', 1);
}
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', 
credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
// T22: app.use(requestLogger);
app.use('/api', routes);
// T23: app.use(notFound);
// T23: app.use(errorHandler);
module.exports = app;