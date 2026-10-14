require('dotenv').config();
const { validateEnvironment } = require('./config/environment');

validateEnvironment();
const app = require('./app');

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`StackStorm API listening on port ${port}`); // eslint-disable
});
