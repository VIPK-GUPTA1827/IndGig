const ALWAYS_REQUIRED = ['MONGO_URI', 'JWT_SECRET'];
const PROD_REQUIRED = ['CLIENT_URL', 'CORS_ORIGINS'];

/**
 * Validates process.env or a passed-in env object.
 * Pure function: suitable for unit tests without mutating global state.
 */
function checkEnv(env = process.env) {
  const missing = [];
  const warnings = [];
  const errors = [];

  for (const key of ALWAYS_REQUIRED) {
    if (!env[key] || String(env[key]).trim() === '') {
      missing.push(key);
    }
  }

  if (env.NODE_ENV === 'production') {
    for (const key of PROD_REQUIRED) {
      if (!env[key] || String(env[key]).trim() === '') {
        missing.push(key);
      }
    }
  }

  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    if (env.NODE_ENV === 'production') errors.push('JWT_SECRET must contain at least 32 characters in production');
    warnings.push('JWT_SECRET is shorter than 32 characters; recommend a 256-bit secret in production.');
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    errors,
    missing,
    warnings
  };
}

/**
 * Asserts valid environment on server boot.
 * Exits with code 1 if required variables are missing.
 */
function assertEnv(env = process.env) {
  const { valid, missing, warnings, errors } = checkEnv(env);

  warnings.forEach(w => console.warn(`[ENV WARNING] ${w}`));

  if (!valid) {
    console.error(`[FATAL] Invalid environment: ${[...missing, ...errors].join(', ')}`);
    console.error('Please configure these variables in your .env file or hosting provider before booting.');
    if (env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = { checkEnv, assertEnv, ALWAYS_REQUIRED, PROD_REQUIRED };
