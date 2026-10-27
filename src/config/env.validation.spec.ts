import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('should pass validation when valid JWT_SECRET is provided', () => {
    const config = {
      JWT_SECRET: 'super-secure-jwt-secret-key-123456',
      PORT: '4000',
    };

    const validated = validateEnvironment(config);
    expect(validated.JWT_SECRET).toBe('super-secure-jwt-secret-key-123456');
    expect(validated.PORT).toBe(4000);
  });

  it('should throw an error and fail startup when JWT_SECRET is missing', () => {
    const config = {
      PORT: '4000',
    };

    expect(() => validateEnvironment(config)).toThrow(
      /Environment validation failed.*JWT_SECRET is required and cannot be empty/,
    );
  });

  it('should throw an error when JWT_SECRET is empty string', () => {
    const config = {
      JWT_SECRET: '',
    };

    expect(() => validateEnvironment(config)).toThrow(
      /Environment validation failed.*JWT_SECRET is required and cannot be empty/,
    );
  });

  it('should throw an error when JWT_SECRET is too short (< 16 characters)', () => {
    const config = {
      JWT_SECRET: 'short-secret',
    };

    expect(() => validateEnvironment(config)).toThrow(
      /Environment validation failed.*JWT_SECRET must be at least 16 characters long/,
    );
  });
});
