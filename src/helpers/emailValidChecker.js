// emailDeliverability.js
const dns = require("dns").promises;
const SMTPConnection = require("smtp-connection");

const TRUSTED_CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.id",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "yandex.com",
  "gmx.com",
  "aol.com",
  "zoho.com",
]);

async function resolveMxSorted(domain) {
  const recs = await dns.resolveMx(domain);
  return (recs || []).sort((a, b) => a.priority - b.priority);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function smtpProbeOnce(
  mxHost,
  email,
  { timeoutMs, heloName, probeFrom }
) {
  return new Promise((resolve) => {
    const conn = new SMTPConnection({
      host: mxHost,
      port: 25,
      name: heloName || undefined, // EHLO name
      ignoreTLS: false, // STARTTLS jika tersedia
      socketTimeout: Math.min(timeoutMs, 8000),
      connectionTimeout: Math.min(timeoutMs, 6000),
      greetingTimeout: Math.min(timeoutMs, 6000),
    });

    const done = (result) => {
      try {
        conn.close();
      } catch (_) {}
      resolve(result);
    };

    conn.on("error", () => done({ ok: false, reason: "SMTP_UNAVAILABLE" }));

    conn.connect(() => {
      // Gunakan MAIL FROM kosong ("<>") agar menghindari DMARC/SPF ketat sewaktu RCPT
      const fromAddr =
        probeFrom === undefined || probeFrom === null ? "" : String(probeFrom);

      conn.send(
        { from: fromAddr, to: [email] },
        Buffer.from("probe\r\n"),
        (err) => {
          if (!err) return done({ ok: true, reason: "SMTP_ACCEPT" });

          const rcode = Number((err && (err.responseCode || err.code)) || 0);

          if (rcode >= 500 && rcode < 600)
            return done({ ok: false, reason: "SMTP_REJECT" });
          if (rcode >= 400 && rcode < 500)
            return done({ ok: false, reason: "SMTP_TEMPFAIL" });

          return done({ ok: false, reason: "SMTP_UNAVAILABLE" });
        }
      );
    });
  });
}

/**
 * Cek deliverability email dengan strategi hybrid:
 * - MX selalu dicek.
 * - Jika domain trusted consumer -> lolos hanya dgn MX (hindari false negative).
 * - Selain itu, coba RCPT TO ke beberapa MX. TEMPFAIL/UNAVAILABLE diperlakukan soft-pass jika strict=false.
 *
 * @param {string} email
 * @param {object} opts
 * @param {boolean} [opts.useSmtp=true]
 * @param {boolean} [opts.strict=false]  // jika true, TEMPFAIL/UNAVAILABLE akan dianggap gagal
 * @param {number}  [opts.timeoutMs=7000]
 * @param {number}  [opts.maxMx=3]       // berapa MX host yang dicoba
 * @param {string}  [opts.heloName]      // EHLO name kustom (disarankan: domainmu)
 * @param {string}  [opts.probeFrom]     // MAIL FROM; biarkan kosong utk <> (null reverse-path)
 * @returns {Promise<{ok:boolean, reason:string, detail?:any}>}
 */
async function checkEmailDeliverability(email, opts = {}) {
  const {
    useSmtp = true,
    strict = false,
    timeoutMs = 7000,
    maxMx = 3,
    heloName,
    probeFrom,
  } = opts;

  // 1) format dasar
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, reason: "INVALID_FORMAT" };
  }

  const domain = email.split("@")[1].toLowerCase();

  // 2) MX lookup
  let mxRecords;
  try {
    mxRecords = await resolveMxSorted(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { ok: false, reason: "NO_MX" };
    }
  } catch {
    return { ok: false, reason: "DNS_ERROR" };
  }

  // 3) Domain konsumer besar -> cukup MX (hindari false negative)
  if (TRUSTED_CONSUMER_DOMAINS.has(domain)) {
    return { ok: true, reason: "TRUSTED_DOMAIN_MX" };
  }

  if (!useSmtp) {
    return { ok: true, reason: "MX_FOUND" };
  }

  // 4) SMTP RCPT ke beberapa MX (short-circuit kalau ACCEPT)
  const tried = [];
  for (const mx of mxRecords.slice(0, Math.max(1, maxMx))) {
    const res = await Promise.race([
      smtpProbeOnce(mx.exchange, email, { timeoutMs, heloName, probeFrom }),
      delay(timeoutMs).then(() => ({ ok: false, reason: "SMTP_UNAVAILABLE" })),
    ]);
    tried.push({ host: mx.exchange, ...res });

    if (res.ok && res.reason === "SMTP_ACCEPT") {
      return { ok: true, reason: "SMTP_ACCEPT", detail: tried };
    }
    // kalau REJECT (5xx) dari salah satu MX, biasanya valid unknown user
    if (res.reason === "SMTP_REJECT") {
      // tetap lanjutkan MX lain (barangkali false reject), tapi simpan
      // (di akhir, jika tak ada ACCEPT, REJECT menang atas TEMP/UNAVAIL)
    }
  }

  // 5) Rekap akhir
  const hasReject = tried.some((t) => t.reason === "SMTP_REJECT");
  const allTempOrUnavailable = tried.every(
    (t) => t.reason === "SMTP_TEMPFAIL" || t.reason === "SMTP_UNAVAILABLE"
  );

  if (hasReject) {
    return { ok: false, reason: "SMTP_REJECT", detail: tried };
  }
  if (allTempOrUnavailable) {
    // Soft-pass jika tidak strict, untuk hindari false negative
    return {
      ok: !strict,
      reason: !strict ? "SOFT_PASS_TEMPORARY" : "SMTP_TEMPFAIL",
      detail: tried,
    };
  }

  // Campuran hasil (mis. TEMP + UNAVAILABLE): ikut strict
  return {
    ok: !strict,
    reason: !strict ? "SOFT_PASS_MIXED" : "SMTP_UNAVAILABLE",
    detail: tried,
  };
}

/**
 * Ringkas: boolean saja
 */
async function isEmailDeliverable(email, opts = {}) {
  const { ok } = await checkEmailDeliverability(email, opts);
  return ok;
}

module.exports = {
  checkEmailDeliverability,
  isEmailDeliverable,
  TRUSTED_CONSUMER_DOMAINS,
};
