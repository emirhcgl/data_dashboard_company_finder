// The ONE domain-extraction helper. Used for lead/email matching and as the
// Twenty CRM match key, so both sides normalise identically.
// The SQL equivalent is `norm_domain(text)` (see migrations/*helper-functions.sql)
// and both must stay in sync.

const STRIP_PREFIXES = ["www.", "www2.", "ww2.", "m."];

export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw.trim().toLowerCase();

  if (value === "") return null;

  // e-mail address -> domain part
  if (value.includes("@")) {
    value = value.slice(value.lastIndexOf("@") + 1);
  }

  // strip scheme
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");

  // strip credentials, path, query, fragment, port
  value = value.split("/")[0].split("?")[0].split("#")[0];
  value = value.slice(value.lastIndexOf("@") + 1);
  value = value.split(":")[0];

  for (const prefix of STRIP_PREFIXES) {
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length);
      break;
    }
  }

  value = value.replace(/\.$/, "");

  if (!value.includes(".") || value.length < 4) return null;

  return value;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const value = raw.trim().toLowerCase();

  return value.includes("@") ? value : null;
}

export function normalizeCompanyName(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(
      /\b(gmbh|mbh|ag|kg|kgaa|ohg|se|co|company|corp|corporation|inc|ltd|llc|bv|nv|sa|srl|spa|gruppe|group|holding|und|and|&)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return value === "" ? null : value;
}
