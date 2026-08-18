// Connection handling ONLY. Table names, row shapes, column whitelists and SQL
// live in `app/models/*`. Nothing else belongs in this file.

import { Pool, PoolClient } from "pg";
import { env } from "./env";

// --- mssql-compatible shim over node-postgres ----------------------------
// Models keep using `pool.request().input(...).query(...)` and `result.recordset`
// so knowledge transfers between this app and data_dashboard.
// Named params (@name) are rewritten to $1, $2 ...
// `sql.NVarChar` / `sql.Int` are accepted but ignored (pg infers types).

export const sql = {
  NVarChar: "NVarChar",
  VarChar: "VarChar",
  Int: "Int",
  BigInt: "BigInt",
  Bit: "Bit",
  Float: "Float",
  DateTime: "DateTime",
} as const;

export class DbRequest {
  private params: Record<string, unknown> = {};
  constructor(private client: Pool | PoolClient) {}

  // Supports both input(name, value) and input(name, type, value).
  input(name: string, typeOrValue: unknown, value?: unknown): this {
    this.params[name] = arguments.length >= 3 ? value : typeOrValue;
    return this;
  }

  async query<T = Record<string, unknown>>(text: string) {
    const values: unknown[] = [];
    const seen = new Map<string, number>();
    const converted = text.replace(/@([A-Za-z_]\w*)/g, (_m, name: string) => {
      if (!seen.has(name)) {
        values.push(this.params[name]);
        seen.set(name, values.length);
      }
      return `$${seen.get(name)}`;
    });
    const res = await this.client.query(converted, values);
    return {
      recordset: res.rows as T[],
      rowsAffected: [res.rowCount ?? 0],
    };
  }
}

export class DbPool {
  constructor(private pg: Pool) {}
  request(): DbRequest {
    return new DbRequest(this.pg);
  }
  get raw(): Pool {
    return this.pg;
  }
}

let pgPool: Pool | null = null;
let pool: DbPool | null = null;

export async function getDb(): Promise<DbPool> {
  if (pool) return pool;
  pgPool = new Pool({ connectionString: env.DB_CONNECTION_STRING });
  pool = new DbPool(pgPool);
  return pool;
}
