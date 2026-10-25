const fs = require('fs');
const path = require('path');

describe('STORM-048: Multi-Stage Dockerfile & Cloud Deployment Architecture', () => {
  const dockerfilePath = path.resolve(__dirname, '../../Dockerfile');
  const dockerignorePath = path.resolve(__dirname, '../../.dockerignore');
  let dockerfileContent = '';
  let dockerignoreContent = '';

  beforeAll(() => {
    dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    if (fs.existsSync(dockerignorePath)) {
      dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf8');
    }
  });

  describe('Multi-Stage Production Dockerfile (AC1)', () => {
    it('should define a multi-stage build using node:20-alpine as builder and runner', () => {
      expect(dockerfileContent).toMatch(/FROM\s+node:20-alpine\s+AS\s+builder/i);
      expect(dockerfileContent).toMatch(/FROM\s+node:20-alpine\s+AS\s+runner/i);
    });

    it('should exclude devDependencies during production install in builder stage', () => {
      expect(dockerfileContent).toMatch(/npm (ci|install) .*(omit=dev|only=production|--production)/i);
    });

    it('should enforce non-root security execution using USER node', () => {
      expect(dockerfileContent).toMatch(/USER\s+node/i);
    });

    it('should integrate dumb-init for PID 1 signal forwarding and graceful SIGTERM handling', () => {
      expect(dockerfileContent).toMatch(/dumb-init/i);
      expect(dockerfileContent).toMatch(/ENTRYPOINT\s+\[.*dumb-init/i);
    });

    it('should expose backend application port 5000 and configure Docker HEALTHCHECK', () => {
      expect(dockerfileContent).toMatch(/EXPOSE\s+5000/i);
      expect(dockerfileContent).toMatch(/HEALTHCHECK/i);
    });

    it('should have a corresponding .dockerignore excluding node_modules, tests, and env secrets', () => {
      expect(fs.existsSync(dockerignorePath)).toBe(true);
      expect(dockerignoreContent).toMatch(/node_modules/);
      expect(dockerignoreContent).toMatch(/tests/);
      expect(dockerignoreContent).toMatch(/\.env/);
    });
  });
});
