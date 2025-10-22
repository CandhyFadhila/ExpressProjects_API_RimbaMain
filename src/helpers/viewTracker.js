const knex = require("../config/database");

// ---------- IP utils ----------
function normalizeIp(ip) {
  return String(ip || "")
    .trim()
    .replace(/^::ffff:/, "");
}

function isPrivateIpv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  return (
    p[0] === 10 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    p[0] === 127 || // loopback
    (p[0] === 169 && p[1] === 254) // link-local
  );
}

function isLocalOrPrivate(ip) {
  const s = normalizeIp(ip);
  if (!s) return true;
  if (s.includes(":")) {
    // IPv6: minimal handle loopback & typical locals
    return (
      s === "::1" ||
      s.startsWith("fe80") ||
      s.startsWith("fc") ||
      s.startsWith("fd")
    );
  }
  return isPrivateIpv4(s);
}

function firstPublicFromXff(xff) {
  if (!xff) return null;
  const list = String(xff)
    .split(",")
    .map((s) => normalizeIp(s))
    .filter(Boolean);
  for (const ip of list) {
    if (!isLocalOrPrivate(ip)) return ip;
  }
  // kalau semua private, ambil yang pertama saja
  return list[0] || null;
}

/** Ambil IP client paling tepercaya */
function getClientIp(req) {
  // 1) Cloudflare / Akamai dll.
  const cfConn = normalizeIp(req.headers["cf-connecting-ip"]);
  if (cfConn) return cfConn;

  const trueClient = normalizeIp(req.headers["true-client-ip"]);
  if (trueClient) return trueClient;

  // 2) XFF: ambil IP publik pertama
  const xff = firstPublicFromXff(req.headers["x-forwarded-for"]);
  if (xff) return xff;

  // 3) X-Real-IP
  const xri = normalizeIp(req.headers["x-real-ip"]);
  if (xri) return xri;

  // 4) Fallback Express / Node
  const raw =
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress;
  return normalizeIp(raw);
}

/** Negara: dari header CDN. Kalau tak ada, biarkan null. */
function getViewerRegion(req) {
  const cf = (req.headers["cf-ipcountry"] || "").trim(); // ISO-3166-1 alpha-2
  if (cf) return cf;
  const xgeo = (
    req.headers["x-geo-country"] ||
    req.headers["x-country-code"] ||
    ""
  ).trim();
  return xgeo || null;
}

/**
 * Catat view unik per (topic, ip, date) & update agregat.
 * Gunakan ON CONFLICT by columns agar tak bergantung nama constraint.
 */
async function trackTopicViewsForReq(topicIds, req) {
  if (!Array.isArray(topicIds) || topicIds.length === 0) return;

  const ip = getClientIp(req);
  if (!ip) return; // tidak bisa melacak tanpa IP (contoh: unit test)

  const region = getViewerRegion(req);

  const ids = Array.from(
    new Set(topicIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))
  );
  if (ids.length === 0) return;

  await knex.transaction(async (trx) => {
    await trx.raw(
      `
      WITH ids AS (SELECT UNNEST(?::bigint[]) AS id),
      ins AS (
        INSERT INTO kmis_topic_views (kmis_topic_id, viewer_ip, viewer_region, view_date)
        SELECT ids.id, ?::inet, ?::text, CURRENT_DATE
        FROM ids
        ON CONFLICT ON CONSTRAINT uniq_topic_ip_date DO NOTHING
        RETURNING kmis_topic_id
      ),
      agg AS (
        SELECT kmis_topic_id, COUNT(*)::int AS add_count
        FROM ins
        GROUP BY kmis_topic_id
      )
      UPDATE kmis_topics t
      SET total_views = COALESCE(t.total_views, 0) + agg.add_count
      FROM agg
      WHERE t.id = agg.kmis_topic_id
      `,
      [ids, ip, region]
    );
  });
}

module.exports = { trackTopicViewsForReq, getClientIp, getViewerRegion };
