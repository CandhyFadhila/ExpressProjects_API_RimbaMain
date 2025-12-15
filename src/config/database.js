const knex = require("knex");

/**
 * getRequiredEnv
 * Mengambil env var wajib (string). Throw jika kosong/tidak ada.
 */
function getRequiredEnv(name) {
  const v = process.env[name];
  const s = (v ?? "").toString().trim();
  if (!s) throw new Error(`ENV wajib "${name}" belum diisi.`);
  return s;
}

/**
 * getRequiredIntEnv
 * Mengambil env var wajib (int). Throw jika kosong/tidak valid.
 */
function getRequiredIntEnv(name) {
  const raw = getRequiredEnv(name);
  const n = Number(raw);
  if (!Number.isInteger(n))
    throw new Error(`ENV "${name}" harus integer. Dapat: "${raw}"`);
  return n;
}

/**
 * resolveDbConnection
 * Membentuk config connection Knex dari env berbasis PG_ENV.
 */
function resolveDbConnection() {
  const env = getRequiredEnv("PG_ENV").toLowerCase();
  const suffix = env.toUpperCase();

  return {
    host: getRequiredEnv(`DB_HOST_${suffix}`),
    port: getRequiredIntEnv(`DB_PORT_${suffix}`),
    user: getRequiredEnv(`DB_USER_${suffix}`),
    password: getRequiredEnv(`DB_PASSWORD_${suffix}`),
    database: getRequiredEnv(`DB_NAME_${suffix}`),
  };
}

const db = knex({
  client: "pg",
  connection: resolveDbConnection(),
  pool: { min: 2, max: 50 },
  acquireConnectionTimeout: 10000,
});

module.exports = db;
