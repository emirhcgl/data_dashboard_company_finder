// Typed, validated environment access.
//
// Required values are read through `required()`, which throws a clear message the
// first time the value is actually needed (request time), so a missing secret can
// never be silently coerced to "" and `next build` still works without a database.
// `assertRuntimeEnv()` is called by the API routes to fail fast per request.

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }

  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];

  return value && value.trim() !== "" ? value : undefined;
}

export const env = {
  // Database
  get DB_CONNECTION_STRING() {
    return required("DB_CONNECTION_STRING");
  },
  get DB_TABLE() {
    return optional("DB_TABLE");
  },
  get DB_COMPANIES_TABLE() {
    return optional("DB_COMPANIES_TABLE");
  },
  get DB_TECH_TABLE() {
    return optional("DB_TECH_TABLE");
  },
  get DB_BENCHMARKS_TABLE() {
    return optional("DB_BENCHMARKS_TABLE");
  },
  get DB_EMPLOYEES_TABLE() {
    return optional("DB_EMPLOYEES_TABLE");
  },
  get DB_EMAILS_TABLE() {
    return optional("DB_EMAILS_TABLE");
  },
  get DB_LEADS_TABLE() {
    return optional("DB_LEADS_TABLE");
  },

  // Auth
  get SESSION_SECRET() {
    return required("SESSION_SECRET");
  },
  get ADMIN_EMAIL() {
    return required("ADMIN_EMAIL");
  },
  get ADMIN_PASSWORD_HASH() {
    return required("ADMIN_PASSWORD_HASH");
  },
  get EXTERNAL_API_KEY() {
    return optional("EXTERNAL_API_KEY");
  },

  // Twenty CRM (optional: the app degrades gracefully without it)
  get TWENTY_API_URL() {
    return optional("TWENTY_API_URL");
  },
  get TWENTY_API_KEY() {
    return optional("TWENTY_API_KEY");
  },
  /** Where a human clicks through to a record. Twenty Cloud serves the API on
   *  api.twenty.com and the UI on app.twenty.com, so default by swapping the host. */
  get TWENTY_APP_URL() {
    return optional("TWENTY_APP_URL");
  },
};

// Everything the app cannot serve a single request without.
const RUNTIME_REQUIRED = [
  "DB_CONNECTION_STRING",
  "SESSION_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
] as const;

export function assertRuntimeEnv(): void {
  const missing = RUNTIME_REQUIRED.filter(
    (name) => !process.env[name] || process.env[name]!.trim() === "",
  );

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. See .env.example.`,
    );
  }
}

export function isTwentyConfigured(): boolean {
  return Boolean(env.TWENTY_API_URL && env.TWENTY_API_KEY);
}
