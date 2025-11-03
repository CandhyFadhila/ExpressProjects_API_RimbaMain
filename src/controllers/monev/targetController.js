const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { orderByYearMonth } = require("../../helpers/orderByYearMonth");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const targetResource = require("../../resources/monev/targetResource");
const activityLogHelper = require("../../helpers/activityLogHelper");

exports.getTargetbyActivityPackageId = async (req, res) => {
  const { id } = req.params;

  try {
    const activityPackage = await knex("monev_activity_packages")
      .select("id")
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!activityPackage) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Paket aktivitas dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const { sql, bindings } = orderByYearMonth("year", "month", "asc", "asc");

    const originals = await knex("monev_targets")
      .where("monev_activity_packages_id", id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings);

    const pendings = await knex("monev_target_pending_updates")
      .where("monev_activity_packages_id", id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings);

    const monevTargetOriginal = await Promise.all(
      originals.map((row) => targetResource(row))
    );
    const monevTargetPendingUpdate = await Promise.all(
      pendings.map((row) => targetResource(row))
    );

    const data = {
      monevTargetOriginal,
      monevTargetPendingUpdate,
    };

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Daftar target untuk paket aktivitas #${id} berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Target MONEV | - Error function getTargetbyActivityPackageId: ${error.message}`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

exports.update = async (req, res) => {
  const trx = await knex.transaction();
  const payload = {
    budgetTarget: req.body.budgetTarget,
    physicalTarget: req.body.physicalTarget,
    description: req.body.description,
  };
  const userId = activityLogHelper.fromReq(req);
  const id = req.params.id;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((err) => err.msg)
        .join(" ");
      const response = new WithoutDataResource(
        422,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(422).json(response.toResponse());
    }

    const user = await knex("users")
      .select("id", "role_id")
      .where({ id: userId })
      .first();
    if (!user) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "INVALID_USER_ID",
        "Akun Tidak Ditemukan",
        `Akun dengan id '${userId}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const userRoleId = Number(user.role_id);

    const result = await updateTarget(trx, { id, payload, userId, userRoleId });

    await trx.commit();

    if (result.mode === "direct") {
      const response = new WithoutDataResource(
        200,
        "SUCCESS_UPDATE_DATA",
        "Berhasil Memperbarui",
        `Perubahan target berhasil diperbarui langsung karena sebelumnya belum memiliki data.`
      );
      return res.status(200).json(response.toResponse());
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_QUEUE_UPDATE",
      "Perubahan Menunggu Validasi",
      `Perubahan target berhasil disimpan sebagai usulan dan menunggu validasi.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Target MONEV | - Error function update : ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem. Silakan coba lagi nanti."
    );
    return res.status(500).json(response.toResponse());
  }
};

exports.verification = async (req, res) => {
  const trx = await knex.transaction();
  const payload = {
    validationStatus: req.body.validationStatus,
    rejectionReason: req.body.rejectionReason,
  };
  const userId = activityLogHelper.fromReq(req);
  const id = req.params.id;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((err) => err.msg)
        .join(" ");
      const response = new WithoutDataResource(
        422,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(422).json(response.toResponse());
    }

    const user = await knex("users")
      .select("id", "role_id")
      .where({ id: userId })
      .first();
    if (!user) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "INVALID_USER_ID",
        "Akun Tidak Ditemukan",
        `Akun dengan id '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const userRoleId = Number(user.role_id);
    if (userRoleId !== 1) {
      await trx.rollback();
      const response = new WithoutDataResource(
        403,
        "FORBIDDEN_ROLE",
        "Akses Ditolak",
        "Anda tidak memiliki hak untuk melakukan Verifikasi Target."
      );
      return res.status(403).json(response.toResponse());
    }

    const existing = await trx("monev_targets")
      .select([
        "id",
        "month",
        "year",
        "budget_target",
        "physical_target",
        "description",
        "validation_status",
        "rejection_message",
      ])
      .where("id", id)
      .forUpdate()
      .first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Target dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(422).json(response.toResponse());
    }

    const periodText = formatPeriodeID(existing.month, existing.year);

    const monthIdx = parseMonthIndex(existing.month);
    const yearNum = Number(existing.year);
    if (!Number.isFinite(yearNum) || monthIdx == null) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "INVALID_PERIOD",
        "Periode Tidak Valid",
        "Nilai bulan/tahun tidak valid untuk diverifikasi."
      );
      return res.status(422).json(response.toResponse());
    }

    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonthIdx = now.getMonth();
    const isFuture =
      yearNum > nowYear || (yearNum === nowYear && monthIdx > nowMonthIdx);

    if (isFuture) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "FUTURE_PERIOD_NOT_ALLOWED",
        "Tidak Boleh Verifikasi Periode Mendatang",
        `Periode '${periodText}' masih di masa depan dan belum bisa diverifikasi.`
      );
      return res.status(422).json(response.toResponse());
    }

    if (existing.validation_status === 2 || existing.validation_status === 3) {
      const statusMap = { 1: "Pending", 2: "Approve", 3: "Rejected" };
      const response = new WithoutDataResource(
        200,
        "ALREADY_VALIDATED",
        "Sudah Divalidasi",
        `Target bulan '${periodText}' sudah berstatus ${
          statusMap[existing.validation_status]
        }.`
      );
      return res.status(200).json(response.toResponse());
    }

    const result = await verifyTarget(trx, { id, payload, userId });
    const periodTextResult = formatPeriodeID(result.month, result.year);

    await trx.commit();

    // approved
    if (result.mode === "approved") {
      const response = new WithoutDataResource(
        200,
        "SUCCESS_APPROVE",
        "Berhasil Approve",
        `Target bulan '${periodTextResult}' berhasil disetujui dan diperbarui.`
      );
      return res.status(200).json(response.toResponse());
    }

    // rejected
    const response = new WithoutDataResource(
      200,
      "SUCCESS_REJECT",
      "Berhasil Reject",
      `Target bulan '${periodTextResult}' ditolak dengan alasan: ${payload.rejectionReason}.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Target MONEV | - Error function verification : ${error.message}`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem. Silakan coba lagi nanti."
    );
    return res.status(500).json(response.toResponse());
  }
};

/**
 * updateTarget
 * Alur:
 * - Jika kedua kolom existing (budget_target & physical_target) masih 0/null => UPDATE langsung ke monev_targets
 * - Jika salah satu sudah terisi (≠ 0 / tidak null) => INSERT ke monev_target_pending_updates + set monev_targets.validation_status = 1
 */
async function updateTarget(trx, { id, payload, userId, userRoleId }) {
  const isProvided = (v) =>
    !(
      v === undefined ||
      v === null ||
      String(v).trim() === "" ||
      /^null$/i.test(String(v)) ||
      /^undefined$/i.test(String(v))
    );
  const toNonNegInt = (v) =>
    isProvided(v) ? Math.max(0, parseInt(v, 10)) : null;
  const toNonNegFloat = (v) =>
    isProvided(v) ? Math.max(0, parseFloat(v)) : null;
  const isNullOrZero = (v) => v === null || Number(v) === 0;
  const now = trx.fn.now();

  const budgetTarget = toNonNegInt(payload.budgetTarget);
  const physicalTarget = toNonNegFloat(payload.physicalTarget);
  const { description } = payload;

  // lock row target
  const existing = await trx("monev_targets")
    .select([
      "id",
      "validate_by",
      "edited_by",
      "monev_activity_packages_id",
      "month",
      "year",
      "budget_target",
      "physical_target",
      "description",
      "validation_status",
      "rejection_message",
    ])
    .where("id", id)
    .forUpdate()
    .first();

  if (!existing) {
    const err = new Error("Target not found");
    err.code = "TARGET_NOT_FOUND";
    throw err;
  }
  const periodText = formatPeriodeID(existing.month, existing.year);

  // === JALUR SUPER ADMIN -> selalu update langsung + edited_by + validation_status
  const isSuperAdmin = Number(userRoleId) === 1;
  if (isSuperAdmin) {
    const patch = {
      edited_by: userId,
      validate_by: userId,
      validation_status: 2,
      validate_at: now,
      updated_at: now,
    };
    if (isProvided(budgetTarget)) patch.budget_target = budgetTarget;
    if (isProvided(physicalTarget)) patch.physical_target = physicalTarget;
    if (isProvided(description)) patch.description = description;

    await trx("monev_targets").where("id", id).update(patch);

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Target Kegiatan Bulan '${existing.month} ${existing.year}' (update langsung oleh superadmin)`,
      },
      trx
    );

    // (Opsional) bersihkan pending aktif untuk target ini jika ada:
    await trx("monev_target_pending_updates")
      .where({ monev_target_id: id })
      .whereNull("deleted_at")
      .update({ deleted_at: now, updated_at: now });

    return { mode: "direct", patch };
  }

  // === JALUR NORMAL ===
  const bothEmpty =
    isNullOrZero(existing.budget_target) &&
    isNullOrZero(existing.physical_target);

  if (bothEmpty) {
    // === UPDATE LANGSUNG (pertama kali diisi) ===
    const patch = {
      updated_at: now,
      edited_by: userId,
      validation_status: 2,
      validate_by: userId,
      updated_at: now,
    };
    if (isProvided(budgetTarget)) patch.budget_target = budgetTarget;
    if (isProvided(physicalTarget)) patch.physical_target = physicalTarget;
    if (isProvided(description)) patch.description = description;

    await trx("monev_targets").where("id", id).update(patch);

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Target Kegiatan Bulan '${periodText}' (update langsung)`,
      },
      trx
    );

    return { mode: "direct", patch };
  }

  // === PENDING UPDATE ===
  const candidate = {
    monev_target_id: id,
    edited_by: userId,
    monev_activity_packages_id: existing.monev_activity_packages_id,
    month: existing.month,
    year: existing.year,
    budget_target: isProvided(budgetTarget)
      ? budgetTarget
      : existing.budget_target,
    physical_target: isProvided(physicalTarget)
      ? physicalTarget
      : existing.physical_target,
    description: isProvided(description) ? description : existing.description,
  };

  // replace jika status target menunggu validasi (validation_status === 1)
  if (existing.validation_status === 1) {
    const latestPending = await trx("monev_target_pending_updates")
      .where({ monev_target_id: id })
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
      .first();

    if (latestPending) {
      await trx("monev_target_pending_updates")
        .where("id", latestPending.id)
        .update({ ...candidate, updated_at: now });

      await trx("monev_target_pending_updates")
        .where({ monev_target_id: id })
        .whereNull("deleted_at")
        .whereNot("id", latestPending.id)
        .update({ deleted_at: now, updated_at: now });

      await activityLogHelper.logUpdate(
        {
          userId,
          module: "monev",
          subject: `Target Kegiatan Bulan '${periodText}' (pending update replaced)`,
        },
        trx
      );

      return {
        mode: "pending",
        pending: { id: latestPending.id, ...candidate },
      };
    }
  }

  // insert pending baru + set validation_status target = 1 bila belum
  const pendingRow = { ...candidate, created_at: now, updated_at: now };
  const inserted = await trx("monev_target_pending_updates")
    .insert(pendingRow)
    .returning(["id"]);
  const pendingId = Array.isArray(inserted)
    ? typeof inserted[0] === "object"
      ? inserted[0].id
      : inserted[0]
    : null;

  if (existing.validation_status !== 1) {
    await trx("monev_targets").where("id", id).update({
      validation_status: 1,
      updated_at: now,
    });
  }

  await activityLogHelper.logCreate(
    {
      userId,
      module: "monev",
      subject: `Target Kegiatan Bulan '${periodText}'  (pending update)`,
    },
    trx
  );

  return { mode: "pending", pending: { id: pendingId, ...pendingRow } };
}

/**
 * verifyTarget
 * - Approve (2): salin nilai dari pending -> targets, set validate_by/validate_at/status, kosongkan rejection_message.
 * - Reject  (3): tidak salin nilai; set validate_by/validate_at/status, isi rejection_message.
 * - Keduanya: soft-delete seluruh pending aktif untuk target agar tidak menumpuk.
 */
async function verifyTarget(trx, { id, payload, userId }) {
  const now = trx.fn.now();

  // Ambil target + pending terbaru (jika ada)
  const target = await trx("monev_targets")
    .select(["id", "month", "year"])
    .where("id", id)
    .first();
  if (!target) {
    const err = new Error("Target not found");
    err.code = "TARGET_NOT_FOUND";
    throw err;
  }
  const periodText = formatPeriodeID(target.month, target.year);

  // Pending terbaru (kalau ada)
  const latestPending = await trx("monev_target_pending_updates")
    .where({ monev_target_id: id })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .first();

  if (payload.validationStatus === 2) {
    // Approve mewajibkan ada pending
    if (!latestPending) {
      const err = new Error("Tidak ada usulan pending untuk diverifikasi.");
      err.code = "NO_PENDING";
      throw err;
    }

    // Salin nilai dari pending → target
    const patch = {
      budget_target: latestPending.budget_target,
      physical_target: latestPending.physical_target,
      description: latestPending.description,
      validate_by: userId,
      validate_at: now,
      validation_status: 2,
      rejection_message: null,
      updated_at: now,
    };

    await trx("monev_targets").where("id", id).update(patch);

    // Soft-delete semua pending aktif milik target ini
    await trx("monev_target_pending_updates")
      .where({ monev_target_id: id })
      .whereNull("deleted_at")
      .update({ deleted_at: now, updated_at: now });

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Verifikasi Target Bulan '${periodText}' (APPROVED)`,
      },
      trx
    );

    return { mode: "approved", month: target.month, year: target.year, patch };
  }

  // === Rejected (3) ===
  const patchReject = {
    validate_by: userId,
    validate_at: now,
    validation_status: 3,
    rejection_message: payload.rejectionReason ?? null,
    updated_at: now,
  };

  await trx("monev_targets").where("id", id).update(patchReject);

  // Soft-delete seluruh pending aktif agar bersih
  await trx("monev_target_pending_updates")
    .where({ monev_target_id: id })
    .whereNull("deleted_at")
    .update({ deleted_at: now, updated_at: now });

  await activityLogHelper.logUpdate(
    {
      userId,
      module: "monev",
      subject: `Verifikasi Target Bulan '${periodText}' (REJECTED)`,
    },
    trx
  );

  return {
    mode: "rejected",
    month: target.month,
    year: target.year,
    patch: patchReject,
  };
}

function parseMonthIndex(m) {
  if (m == null) return null;
  const s = String(m).trim();

  // jika angka: dukung "0..11" atau "1..12"
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (n >= 0 && n <= 11) return n; // penyimpanan 0..11
    if (n >= 1 && n <= 12) return n - 1; // penyimpanan 1..12
    return null;
  }

  // mapping nama bulan (EN + ID)
  const map = {
    jan: 0,
    january: 0,
    januari: 0,
    feb: 1,
    february: 1,
    februari: 1,
    mar: 2,
    march: 2,
    maret: 2,
    apr: 3,
    april: 3,
    may: 4,
    mei: 4,
    jun: 5,
    june: 5,
    juni: 5,
    jul: 6,
    july: 6,
    juli: 6,
    aug: 7,
    august: 7,
    agustus: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    oktober: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
    desember: 11,
  };
  return map[s.toLowerCase()] ?? null;
}

function monthNameID(m) {
  const NAMES = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const n = Number(m);
  if (!Number.isFinite(n)) return String(m ?? "");

  if (n >= 0 && n <= 11) return NAMES[n];

  if (n >= 1 && n <= 12) return NAMES[n - 1];

  return String(m);
}

function formatPeriodeID(monthIndex, year) {
  const name = monthNameID(monthIndex);
  return year != null ? `${name} ${year}` : name;
}
