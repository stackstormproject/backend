const databaseConfig = require('../../../src/config/database');

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;

function restoreEnvironmentVariable(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('test database configuration', () => {
  beforeEach(() => {
    delete process.env.TEST_DATABASE_URL;
  });

  afterEach(() => {
    restoreEnvironmentVariable('DATABASE_URL', originalDatabaseUrl);
    restoreEnvironmentVariable('TEST_DATABASE_URL', originalTestDatabaseUrl);
  });

  it('derives a separate test database URL from a development URL', () => {
    process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/stackstorm_dev';

    expect(new URL(databaseConfig.test.url).pathname).toBe('/stackstorm_test');
  });

  it('uses an explicit test URL when configured', () => {
    process.env.TEST_DATABASE_URL = 'postgres://user:password@localhost:5432/backend_test';
    process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/stackstorm_dev';

    expect(new URL(databaseConfig.test.url).pathname).toBe('/backend_test');
  });

  it('accepts the legacy testdb name from CI DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/testdb';

    expect(new URL(databaseConfig.test.url).pathname).toBe('/testdb');
  });

  it('rejects explicit URLs that do not target test databases', () => {
    process.env.TEST_DATABASE_URL = 'postgres://user:password@localhost:5432/stackstorm_dev';

    expect(() => databaseConfig.test.url).toThrow(
      'TEST_DATABASE_URL must target testdb or a database whose name ends in _test'
    );
  });

  it('rejects database URLs without a recognized test or development suffix', () => {
    process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/stackstorm';

    expect(() => databaseConfig.test.url).toThrow(
      'Set TEST_DATABASE_URL or use a DATABASE_URL database name ending in _dev'
    );
  });

  it('requires a URL when neither a test nor development URL is set', () => {
    delete process.env.DATABASE_URL;

    expect(() => databaseConfig.test.url).toThrow(
      'Set TEST_DATABASE_URL or DATABASE_URL to a development database ending in _dev'
    );
  });
});
