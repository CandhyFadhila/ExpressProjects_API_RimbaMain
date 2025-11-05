const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { orderByYearMonth } = require("../../helpers/orderByYearMonth");
const { asJsonb } = require("../../helpers/dbJson");
const {
  toArray,
  normJsonbArray,
  normIdArray,
  parseJsonSafe,
  isPlainObject,
} = require("../../helpers/inputNorm");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const monthlyRealizationResource = require("../../resources/monev/monthlyRealizationResource");
const activityLogHelper = require("../../helpers/activityLogHelper");

exports.getMonthlyRealizationbyActivityPackageId = async (req, res) => {
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

    const originals = await knex("monev_monthly_realizations")
      .where("monev_activity_packages_id", id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings);

    const pendings = await knex("monev_monthly_realization_pending_updates")
      .where("monev_activity_packages_id", id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings);

    const monevMonthlyRealizationtOriginal = await Promise.all(
      originals.map((row) => monthlyRealizationResource(row))
    );
    const monevMonthlyRealizationPendingUpdate = await Promise.all(
      pendings.map((row) => monthlyRealizationResource(row))
    );

    const data = {
      monevMonthlyRealizationtOriginal,
      monevMonthlyRealizationPendingUpdate,
    };

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Daftar realisasi bulanan untuk paket aktivitas #${id} berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Monthly Realization MONEV | - Error function getMonthlyRealizationbyActivityPackageId: ${error.message}`
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
    budgetRealization: req.body.budgetRealization,
    progress: req.body.progress,
    description: req.body.description,
    problem: req.body.problem,
    deleteDocumentIds: req.body.deleteDocumentIds,
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

    const existing = await knex("monev_monthly_realizations")
      .select([
        "id",
        "monev_activity_packages_id",
        "evidence_file_ids",
        "month",
        "year",
      ])
      .where("id", id)
      .first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Realisasi bulanan dengan id '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
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
        "Nilai bulan/tahun pada realisasi tidak valid."
      );
      return res.status(422).json(response.toResponse());
    }

    const target = await trx("monev_targets")
      .select(["id", "budget_target", "physical_target"])
      .where("monev_activity_packages_id", existing.monev_activity_packages_id)
      .andWhere("month", monthIdx)
      .andWhere("year", yearNum)
      .whereNull("deleted_at")
      .first();
    const isEmptyVal = (v) => {
      if (v == null) return true;
      if (typeof v === "string") return v.trim() === "" || Number(v) === 0;
      if (typeof v === "number") return Number(v) === 0;
      const n = Number(v);
      return Number.isFinite(n) ? n === 0 : false;
    };
    if (
      !target ||
      (isEmptyVal(target.budget_target) && isEmptyVal(target.physical_target))
    ) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "TARGET_REQUIRED",
        "Target Bulanan Belum Diisi",
        `Mohon lengkapi minimal salah satu target pada target (budget target atau physical target) untuk periode '${periodText}' sebelum mengisi realisasi.`
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

    // === Normalisasi budgetRealization ===
    if (payload.budgetRealization !== undefined) {
      const norm = handleBudgetRealizationArray(payload.budgetRealization, {
        allowEmpty: false,
        maxNameLen: 255,
        fieldLabel: "budgetRealization",
      });
      if (norm.error) {
        await trx.rollback();
        return res.status(422).json(norm.error.toResponse());
      }
      payload.budgetRealization = norm.value;
    }

    // === Documents ===
    const latestPending = await trx("monev_monthly_realization_pending_updates")
      .select(["id", "evidence_file_ids"])
      .where({ monev_monthly_realization_id: id })
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
      .first();

    const existingIdsArr = normJsonbArray(existing.evidence_file_ids);
    const baseEvidenceJsonb =
      existingIdsArr.length > 0
        ? existing.evidence_file_ids
        : latestPending?.evidence_file_ids ?? [];

    const { deleteDocumentIds } = payload;
    const deletedIds = toArray(deleteDocumentIds).map(String);
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    const validation = await validateFilesQuotaAndTypesOnUpdate({
      existingRow: { evidence_file_ids: baseEvidenceJsonb },
      deleteDocumentIds: deletedIds,
      files: Array.isArray(req.files) ? req.files : [],
      dbColumn: "evidence_file_ids",
      maxFilesAllowed: 1,
      allowedTypes,
      sizeLimitBytes: 10 * 1024 * 1024, // 10MB
    });
    if (!validation.ok) {
      const response = new WithoutDataResource(
        validation.http,
        validation.code,
        validation.title,
        validation.desc
      );
      return res.status(validation.http).json(response.toResponse());
    }

    const oldCoverIds = normJsonbArray(baseEvidenceJsonb);
    const oldDocId = normIdArray(oldCoverIds, { as: "number" })[0] ?? null;

    let finalDocId = oldDocId;
    if (finalDocId != null && deletedIds.includes(String(finalDocId))) {
      await documentHelper.deleteDocuments([finalDocId]);
      finalDocId = null;
    }

    let uploadIds = null;
    if (Array.isArray(req.files) && req.files.length > 0) {
      uploadIds = await documentHelper.uploadDocuments(req.files, req);
    }

    const evidenceId = uploadIds?.[0] ?? finalDocId ?? null;
    const evidenceArr = evidenceId != null ? [Number(evidenceId)] : [];
    const evidence_file_ids = asJsonb(evidenceArr);

    const result = await updateMonthlyRealization(trx, {
      id,
      payload,
      userId,
      userRoleId,
      evidence_files: evidence_file_ids,
    });

    await trx.commit();

    if (result.mode === "direct") {
      const response = new WithoutDataResource(
        200,
        "SUCCESS_UPDATE_DATA",
        "Berhasil Memperbarui",
        `Perubahan realisasi bulanan berhasil diperbarui langsung.`
      );
      return res.status(200).json(response.toResponse());
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_QUEUE_UPDATE",
      "Perubahan Menunggu Validasi",
      `Perubahan realisasi bulanan berhasil disimpan sebagai usulan dan menunggu validasi.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Monthly Realization MONEV | - Error function update : ${error.message}`
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

exports.verification = async (req, res) => {
  const trx = await knex.transaction();
  const payload = {
    validationStatus: req.body.validationStatus,
    rejectionReason: req.body.rejectionReason,
  };
  const userId = activityLogHelper.fromReq(req);
  const pendingId = req.params.id;

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

    if (Number(user.role_id) !== 1) {
      await trx.rollback();
      const response = new WithoutDataResource(
        403,
        "FORBIDDEN_ROLE",
        "Akses Ditolak",
        "Anda tidak memiliki hak untuk melakukan Verifikasi Realisasi bulanan."
      );
      return res.status(403).json(response.toResponse());
    }

    const pendingRealization = await trx(
      "monev_monthly_realization_pending_updates"
    )
      .select(["id", "monev_monthly_realization_id"])
      .where("id", pendingId)
      .whereNull("deleted_at")
      .forUpdate()
      .first();
    if (!pendingRealization) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Realisasi bulanan data pending dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(422).json(response.toResponse());
    }

    const monthlyId = pendingRealization.monev_monthly_realization_id;

    const existing = await trx("monev_monthly_realizations")
      .select([
        "id",
        "monev_activity_packages_id",
        "month",
        "year",
        "evidence_file_ids",
        "budget_realization",
        "progress",
        "description",
        "problem",
        "validation_status",
        "rejection_message",
      ])
      .where("id", monthlyId)
      .forUpdate()
      .first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Realisasi bulanan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(422).json(response.toResponse());
    }

    const monthIdx = (() => {
      const m = Number(existing.month);
      return Number.isFinite(m) ? m : parseMonthIndex(existing.month);
    })();
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

    const periodText = formatPeriodeID(monthIdx, yearNum);

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
        `Realisasi bulanan untuk bulan '${periodText}' sudah berstatus ${
          statusMap[existing.validation_status]
        }.`
      );
      return res.status(200).json(response.toResponse());
    }

    const target = await trx("monev_targets")
      .select(["id", "budget_target", "physical_target", "validation_status"])
      .where("monev_activity_packages_id", existing.monev_activity_packages_id)
      .andWhere("month", monthIdx)
      .andWhere("year", yearNum)
      .whereNull("deleted_at")
      .first();

    const isEmptyVal = (v) => {
      if (v == null) return true;
      if (typeof v === "string") return v.trim() === "" || Number(v) === 0;
      if (typeof v === "number") return Number(v) === 0;
      const n = Number(v);
      return Number.isFinite(n) ? n === 0 : false;
    };

    if (
      !target ||
      (isEmptyVal(target.budget_target) && isEmptyVal(target.physical_target))
    ) {
      await trx.rollback();
      const resp = new WithoutDataResource(
        422,
        "TARGET_REQUIRED",
        "Target Bulanan Belum Diisi",
        `Target periode '${periodText}' belum memiliki data (budget/physical). Tidak dapat melakukan verifikasi realisasi.`
      );
      return res.status(422).json(resp.toResponse());
    }

    if (Number(target.validation_status ?? 0) !== 2) {
      await trx.rollback();
      const resp = new WithoutDataResource(
        422,
        "TARGET_NOT_VALIDATED",
        "Target Bulanan Belum Tervalidasi",
        `Target periode '${periodText}' belum disetujui/tervalidasi. Tidak dapat melakukan verifikasi realisasi sebelum target disetujui.`
      );
      return res.status(422).json(resp.toResponse());
    }

    const result = await verifyMonthlyRealization(trx, {
      monthlyId,
      payload,
      userId,
    });

    await trx.commit();

    const periodTextResult = formatPeriodeID(result.month, result.year);
    if (result.mode === "approved") {
      const response = new WithoutDataResource(
        200,
        "SUCCESS_APPROVE",
        "Berhasil Approve",
        `Realisasi bulanan untuk bulan '${periodTextResult}' berhasil disetujui dan diperbarui.`
      );
      return res.status(200).json(response.toResponse());
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_REJECT",
      "Berhasil Reject",
      `Realisasi bulanan untuk bulan '${periodTextResult}' ditolak dengan alasan: ${payload.rejectionReason}.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Monthly Realization MONEV | - Error function verification : ${error.message}`
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
 * updateMonthlyRealization
 * Alur:
 * - Jika kedua kolom existing (budget_realization & progress) masih 0/null => UPDATE langsung ke monev_monthly_realizations
 * - Jika salah satu sudah terisi (≠ 0 / tidak null) => INSERT ke monev_monthly_realization_pending_updates + set monev_monthly_realizations.validation_status = 1
 */
async function updateMonthlyRealization(
  trx,
  { id, payload, userId, userRoleId, evidence_files }
) {
  const J = (v) => trx.raw("?::jsonb", [JSON.stringify(v ?? null)]);
  const isProvided = (v) =>
    !(
      v === undefined ||
      v === null ||
      String(v).trim() === "" ||
      /^null$/i.test(String(v)) ||
      /^undefined$/i.test(String(v))
    );

  const now = trx.fn.now();
  const { budgetRealization, progress, description, problem } = payload;

  // lock row monthlyRealization
  const existing = await trx("monev_monthly_realizations")
    .select([
      "id",
      "validate_by",
      "edited_by",
      "monev_activity_packages_id",
      "month",
      "year",
      "evidence_file_ids",
      "budget_realization",
      "progress",
      "description",
      "problem",
      "validation_status",
      "rejection_message",
    ])
    .where("id", id)
    .forUpdate()
    .first();

  if (!existing) {
    const err = new Error("Monthly Realization not found");
    err.code = "MONTHLY_REALIZATION_NOT_FOUND";
    throw err;
  }

  const periodText = formatPeriodeID(existing.month, existing.year);

  // ===========================
  // SUPER ADMIN → DIRECT UPDATE
  // ===========================
  const isSuperAdmin = Number(userRoleId) === 1;
  if (isSuperAdmin) {
    const patch = {
      edited_by: userId,
      validate_by: userId,
      validation_status: 2,
      evidence_file_ids: evidence_files,
      validate_at: now,
      updated_at: now,
    };

    if (isProvided(budgetRealization))
      patch.budget_realization = J(budgetRealization);

    if (isProvided(progress)) {
      const p = Math.max(0, Math.min(100, Number(progress)));
      patch.progress = Number.isFinite(p) ? p : existing.progress;
    }

    if (isProvided(problem)) patch.problem = problem;
    if (isProvided(description)) patch.description = description;

    await trx("monev_monthly_realizations").where("id", id).update(patch);

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Realisasi Bulanan Kegiatan di Bulan '${periodText}' (update langsung oleh superadmin)`,
      },
      trx
    );

    // bersihkan semua pending aktif (kalau ada)
    await trx("monev_monthly_realization_pending_updates")
      .where({ monev_monthly_realization_id: id })
      .whereNull("deleted_at")
      .update({ deleted_at: now, updated_at: now });

    return { mode: "direct", patch };
  }

  // ===========================================
  // NON-SUPERADMIN → SELALU MASUK PENDING
  // ===========================================
  const nextBR = isProvided(budgetRealization)
    ? budgetRealization
    : existing.budget_realization;

  const nextProgress = isProvided(progress)
    ? (() => {
        const p = Math.max(0, Math.min(100, Number(progress)));
        return Number.isFinite(p) ? p : existing.progress;
      })()
    : existing.progress;

  const candidate = {
    monev_monthly_realization_id: id,
    edited_by: userId,
    monev_activity_packages_id: existing.monev_activity_packages_id,
    month: existing.month,
    year: existing.year,
    evidence_file_ids: evidence_files,
    budget_realization: J(nextBR),
    progress: nextProgress,
    problem: isProvided(problem) ? problem : existing.problem,
    description: isProvided(description) ? description : existing.description,
  };

  // Cek pending aktif → replace yang terbaru, soft-delete sisanya
  const latestPending = await trx("monev_monthly_realization_pending_updates")
    .where({ monev_monthly_realization_id: id })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .first();

  if (latestPending) {
    await trx("monev_monthly_realization_pending_updates")
      .where("id", latestPending.id)
      .update({ ...candidate, updated_at: now });

    await trx("monev_monthly_realization_pending_updates")
      .where({ monev_monthly_realization_id: id })
      .whereNull("deleted_at")
      .whereNot("id", latestPending.id)
      .update({ deleted_at: now, updated_at: now });

    if (existing.validation_status !== 1) {
      await trx("monev_monthly_realizations")
        .where("id", id)
        .update({ validation_status: 1, updated_at: now });
    }

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Realisasi Bulanan Kegiatan di Bulan '${periodText}' (pending update replaced)`,
      },
      trx
    );

    return { mode: "pending", pending: { id: latestPending.id, ...candidate } };
  }

  // Belum ada pending → insert baru
  const pendingRow = { ...candidate, created_at: now, updated_at: now };
  const inserted = await trx("monev_monthly_realization_pending_updates")
    .insert(pendingRow)
    .returning(["id"]);
  const pendingId = Array.isArray(inserted)
    ? typeof inserted[0] === "object"
      ? inserted[0].id
      : inserted[0]
    : null;

  if (existing.validation_status !== 1) {
    await trx("monev_monthly_realizations")
      .where("id", id)
      .update({ validation_status: 1, updated_at: now });
  }

  await activityLogHelper.logCreate(
    {
      userId,
      module: "monev",
      subject: `Realisasi Bulanan Kegiatan di Bulan '${periodText}' (pending update)`,
    },
    trx
  );

  return { mode: "pending", pending: { id: pendingId, ...pendingRow } };
}

/**
 * verifyMonthlyRealization
 * - Approve (2): salin nilai dari pending -> monthlyRealizations, set validate_by/validate_at/status, kosongkan rejection_message.
 * - Reject  (3): tidak salin nilai; set validate_by/validate_at/status, isi rejection_message.
 * - Keduanya: soft-delete seluruh pending aktif untuk monthlyRealization agar tidak menumpuk.
 */
async function verifyMonthlyRealization(trx, { monthlyId, payload, userId }) {
  const now = trx.fn.now();

  const J = (v) => {
    // terima array/object/string JSON/null → selalu jadi JSONB valid
    if (typeof v === "string") {
      const parsed = parseJsonSafe(v);
      if (parsed !== null) v = parsed;
    }
    return trx.raw("?::jsonb", [JSON.stringify(v ?? null)]);
  };

  // Ambil monthlyRealization + pending terbaru (jika ada)
  const monthlyRealization = await trx("monev_monthly_realizations")
    .select(["id", "month", "year"])
    .where("id", monthlyId)
    .first();
  if (!monthlyRealization) {
    const err = new Error("Realisasi bulanan not found");
    err.code = "MONTHLY_REALIZATION_NOT_FOUND";
    throw err;
  }
  const periodText = formatPeriodeID(
    monthlyRealization.month,
    monthlyRealization.year
  );

  // Pending terbaru (kalau ada)
  const latestPending = await trx("monev_monthly_realization_pending_updates")
    .where({ monev_monthly_realization_id: monthlyId })
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

    // Salin nilai dari pending → monthlyRealization
    const patch = {
      budget_realization: J(latestPending.budget_realization),
      progress: latestPending.progress,
      problem: latestPending.problem,
      description: latestPending.description,
      evidence_file_ids: J(latestPending.evidence_file_ids),
      validate_by: userId,
      validate_at: now,
      validation_status: 2,
      rejection_message: null,
      updated_at: now,
    };

    await trx("monev_monthly_realizations").where("id", monthlyId).update(patch);

    // Soft-delete semua pending aktif milik monthlyRealization ini
    await trx("monev_monthly_realization_pending_updates")
      .where({ monev_monthly_realization_id: monthlyId })
      .whereNull("deleted_at")
      .update({ deleted_at: now, updated_at: now });

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Verifikasi Realisasi Bulanan Kegiatan di Bulan '${periodText}' (APPROVED)`,
      },
      trx
    );

    return {
      mode: "approved",
      month: monthlyRealization.month,
      year: monthlyRealization.year,
      patch,
    };
  }

  // === Rejected (3) ===
  const patchReject = {
    validate_by: userId,
    validate_at: now,
    validation_status: 3,
    rejection_message: payload.rejectionReason ?? null,
    updated_at: now,
  };

  await trx("monev_monthly_realizations").where("id", monthlyId).update(patchReject);

  // Soft-delete seluruh pending aktif agar bersih
  await trx("monev_monthly_realization_pending_updates")
    .where({ monev_monthly_realization_id: monthlyId })
    .whereNull("deleted_at")
    .update({ deleted_at: now, updated_at: now });

  await activityLogHelper.logUpdate(
    {
      userId,
      module: "monev",
      subject: `Verifikasi Realisasi Bulanan Kegiatan di Bulan '${periodText}' (REJECTED)`,
    },
    trx
  );

  return {
    mode: "rejected",
    month: monthlyRealization.month,
    year: monthlyRealization.year,
    patch: patchReject,
  };
}

async function validateFilesQuotaAndTypesOnUpdate({
  existingRow,
  deleteDocumentIds,
  files,
  dbColumn = "evidence_file_ids",
  maxFilesAllowed = 1,
  allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ],
  sizeLimitBytes = 10 * 1024 * 1024,
}) {
  const currentIds = normIdArray(normJsonbArray(existingRow?.[dbColumn]), {
    as: "string",
  });

  const toDelete = toArray(deleteDocumentIds).map(String);
  const currentAfterDelete = currentIds.filter(
    (id) => !toDelete.includes(String(id))
  );

  const incomingCount = Array.isArray(files) ? files.length : 0;

  if (currentIds.length === 0 && incomingCount === 0) {
    return {
      ok: false,
      http: 422,
      code: "FILES_NOT_FOUND",
      title: "File Tidak Ditemukan",
      desc: "File wajib diunggah untuk pertama kali.",
    };
  }

  const currentCount = currentAfterDelete.length;
  const remaining = Math.max(maxFilesAllowed - currentCount, 0);

  if (remaining === 0 && incomingCount > 0) {
    return {
      ok: false,
      http: 422,
      code: "MAX_CAPACITY",
      title: "Kapasitas Sudah Penuh",
      desc: "Kapasitas file untuk data ini sudah terpenuhi. Tidak ada slot tersisa.",
    };
  }

  if (incomingCount > remaining) {
    return {
      ok: false,
      http: 422,
      code: "UPLOAD_LIMIT_EXCEEDED",
      title: "Terlalu Banyak File",
      desc: `File yang diperbolehkan diupload adalah ${remaining} file.`,
    };
  }

  for (const f of files || []) {
    if (!allowedTypes.includes(f.mimetype)) {
      return {
        ok: false,
        http: 422,
        code: "INVALID_FILE_TYPE",
        title: "Tipe File Salah",
        desc: `File hanya boleh bertipe: JPG, JPEG, PNG, WebP, dan PDF.`,
      };
    }
    if (f.size > sizeLimitBytes) {
      return {
        ok: false,
        http: 422,
        code: "FILE_TOO_LARGE",
        title: "Ukuran File Terlalu Besar",
        desc: `Ukuran maksimal tiap file adalah ${Math.floor(
          sizeLimitBytes / (1024 * 1024)
        )}mB.`,
      };
    }
  }

  return { ok: true, remaining };
}

function handleBudgetRealizationArray(rawContent, opts = {}) {
  const {
    allowEmpty = false,
    maxNameLen = 255,
    fieldLabel = "budgetRealization",
  } = opts;

  let arr = rawContent;
  if (typeof arr === "string") arr = parseJsonSafe(arr) ?? arr;

  if (!Array.isArray(arr)) {
    const err = new WithoutDataResource(
      422,
      "INVALID_CONTENT_FORMAT",
      "Format Konten Salah",
      `${fieldLabel} format harus array of object dengan properti { name: string, value: number }.`
    );
    return { error: err };
  }

  const cleaned = arr
    .map((it) => {
      if (!isPlainObject(it)) return null;
      let { name, value } = it;

      // validasi name
      if (typeof name !== "string") return null;
      name = name.trim();
      if (name.length === 0) return null;
      if (typeof maxNameLen === "number" && name.length > maxNameLen)
        return null;

      // validasi value => number (boleh string angka, kita coerce)
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      if (num < 0) return null; // jika tidak boleh negatif, tetap aman

      return { name, value: num };
    })
    .filter(Boolean);

  if (!allowEmpty && cleaned.length === 0) {
    const err = new WithoutDataResource(
      422,
      "INVALID_CONTENT_ITEMS",
      "Elemen Konten Tidak Valid",
      `Setiap elemen ${fieldLabel} harus objek { name:string, value:number } dan minimal satu elemen valid.`
    );
    return { error: err };
  }

  // Kembalikan array JS murni (bukan string) → cocok untuk JSONB
  return { value: cleaned };
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
