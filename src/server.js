require('dotenv').config();
const { validateEnvironment } = require('./config/environment');

validateEnvironment();
const logger = require('./config/logger');
const app = require('./app');

const port = process.env.PORT || 5000;
app.listen(port, () => {
  logger.info('API listening', { port });
});