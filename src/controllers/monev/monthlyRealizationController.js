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

    const { sql, bindings } = orderByYearMonth(
      "year",
      "month_index",
      "asc",
      "asc"
    );

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
      .select(["id", "evidence_file_ids"])
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
        maxNameLen: 100,
        fieldLabel: "budgetRealization",
      });
      if (norm.error) {
        await trx.rollback();
        return res.status(422).json(norm.error.toResponse());
      }
      payload.budgetRealization = norm.value;
    }

    // === Documents ===
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
      existingRow: existing,
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

    const oldCoverIds = normJsonbArray(existing.evidence_file_ids);
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
        `Perubahan realisasi bulanan berhasil diperbarui langsung karena sebelumnya belum memiliki data.`
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
        "Anda tidak memiliki hak untuk melakukan Verifikasi Realisasi bulanan."
      );
      return res.status(403).json(response.toResponse());
    }

    const existing = await trx("monev_monthly_realizations")
      .select([
        "id",
        "month",
        "year",
        "evidence_file_ids",
        "budged_realization",
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
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Realisasi bulanan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    if (existing.validation_status === 2 || existing.validation_status === 3) {
      const statusMap = { 1: "Pending", 2: "Approve", 3: "Rejected" };
      const response = new WithoutDataResource(
        200,
        "ALREADY_VALIDATED",
        "Sudah Divalidasi",
        `Realisasi bulanan untuk bulan '${existing.month} ${
          existing.year
        }' sudah berstatus ${statusMap[existing.validation_status]}.`
      );
      return res.status(200).json(response.toResponse());
    }

    const result = await verifyMonthlyRealization(trx, { id, payload, userId });

    await trx.commit();

    // approved
    if (result.mode === "approved") {
      const response = new WithoutDataResource(
        200,
        "SUCCESS_APPROVE",
        "Berhasil Approve",
        `Realisasi bulanan untuk bulan '${result.month} ${result.year}' berhasil disetujui dan diperbarui.`
      );
      return res.status(200).json(response.toResponse());
    }

    // rejected
    const response = new WithoutDataResource(
      200,
      "SUCCESS_REJECT",
      "Berhasil Reject",
      `Realisasi bulanan untuk bulan '${result.month} ${result.year}' ditolak dengan alasan: ${payload.rejectionReason}.`
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
 * - Jika kedua kolom existing (budged_realization & progress) masih 0/null => UPDATE langsung ke monev_monthly_realizations
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

  const isEmptyJsonb = (v) => normJsonbArray(v).length === 0;
  const isNullOrZero = (v) => v === null || Number(v) === 0;
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
      "budged_realization",
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

  // === JALUR SUPER ADMIN -> selalu update langsung + edited_by + validation_status
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
      patch.budged_realization = J(budgetRealization);
    if (isProvided(progress)) patch.progress = progress;
    if (isProvided(problem)) patch.problem = problem;
    if (isProvided(description)) patch.description = description;

    await trx("monev_monthly_realizations").where("id", id).update(patch);

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Realisasi Bulanan Kegiatan di Bulan '${existing.month} ${existing.year}' (update langsung oleh superadmin)`,
      },
      trx
    );

    // (Opsional) bersihkan pending aktif untuk monthly realization ini jika ada:
    await trx("monev_monthly_realization_pending_updates")
      .where({ monev_monthly_realization_id: id })
      .whereNull("deleted_at")
      .update({ deleted_at: now, updated_at: now });

    return { mode: "direct", patch };
  }

  // === JALUR NORMAL ===
  const bothEmpty =
    isEmptyJsonb(existing.budged_realization) &&
    isNullOrZero(existing.progress);

  if (bothEmpty) {
    // === UPDATE LANGSUNG (pertama kali diisi) ===
    const patch = {
      updated_at: now,
      evidence_file_ids: evidence_files,
      edited_by: userId,
    };
    if (isProvided(budgetRealization))
      patch.budged_realization = J(budgetRealization);
    if (isProvided(progress)) patch.progress = progress;
    if (isProvided(problem)) patch.problem = problem;
    if (isProvided(description)) patch.description = description;

    await trx("monev_monthly_realizations").where("id", id).update(patch);

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Realisasi Bulanan Kegiatan di Bulan '${existing.month} ${existing.year}' (update langsung)`,
      },
      trx
    );

    return { mode: "direct", patch };
  }

  // === PENDING UPDATE ===
  const nextBR = isProvided(budgetRealization)
    ? budgetRealization
    : existing.budged_realization;

  const candidate = {
    monev_monthly_realization_id: id,
    edited_by: userId,
    monev_activity_packages_id: existing.monev_activity_packages_id,
    month: existing.month,
    year: existing.year,
    evidence_file_ids: evidence_files,
    budged_realization: J(nextBR),
    progress: isProvided(progress) ? progress : existing.progress,
    problem: isProvided(problem) ? problem : existing.problem,
    description: isProvided(description) ? description : existing.description,
  };

  // replace jika status monthlyRealization menunggu validasi (validation_status === 1)
  if (existing.validation_status === 1) {
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

      await activityLogHelper.logUpdate(
        {
          userId,
          module: "monev",
          subject: `Realisasi Bulanan Kegiatan di Bulan '${existing.month} ${existing.year}' (pending update replaced)`,
        },
        trx
      );

      return {
        mode: "pending",
        pending: { id: latestPending.id, ...candidate },
      };
    }
  }

  // insert pending baru + set validation_status monthlyRealization = 1 bila belum
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
    await trx("monev_monthly_realizations").where("id", id).update({
      validation_status: 1,
      updated_at: now,
    });
  }

  await activityLogHelper.logCreate(
    {
      userId,
      module: "monev",
      subject: `Realisasi Bulanan Kegiatan di Bulan '${existing.month} ${existing.year}' (pending update)`,
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
async function verifyMonthlyRealization(trx, { id, payload, userId }) {
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
    .where("id", id)
    .first();
  if (!monthlyRealization) {
    const err = new Error("Realisasi bulanan not found");
    err.code = "MONTHLY_REALIZATION_NOT_FOUND";
    throw err;
  }

  // Pending terbaru (kalau ada)
  const latestPending = await trx("monev_monthly_realization_pending_updates")
    .where({ monev_monthly_realization_id: id })
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
      budged_realization: J(latestPending.budged_realization),
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

    await trx("monev_monthly_realizations").where("id", id).update(patch);

    // Soft-delete semua pending aktif milik monthlyRealization ini
    await trx("monev_monthly_realization_pending_updates")
      .where({ monev_monthly_realization_id: id })
      .whereNull("deleted_at")
      .update({ deleted_at: now, updated_at: now });

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Verifikasi Realisasi Bulanan Kegiatan di Bulan '${monthlyRealization.month} ${monthlyRealization.year}' (APPROVED)`,
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

  await trx("monev_monthly_realizations").where("id", id).update(patchReject);

  // Soft-delete seluruh pending aktif agar bersih
  await trx("monev_monthly_realization_pending_updates")
    .where({ monev_monthly_realization_id: id })
    .whereNull("deleted_at")
    .update({ deleted_at: now, updated_at: now });

  await activityLogHelper.logUpdate(
    {
      userId,
      module: "monev",
      subject: `Verifikasi Realisasi Bulanan Kegiatan di Bulan '${monthlyRealization.month} ${monthlyRealization.year}' (REJECTED)`,
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
  // Normalisasi array dokumen yang saat ini tersimpan
  const currentIds = normIdArray(normJsonbArray(existingRow?.[dbColumn]), {
    as: "string",
  });

  // Normalisasi daftar yang minta dihapus (kalau ada), lalu "simulasikan" state setelah dihapus
  const toDelete = toArray(deleteDocumentIds).map(String);
  const currentAfterDelete = currentIds.filter(
    (id) => !toDelete.includes(String(id))
  );

  // Hitung sisa slot setelah penghapusan
  const currentCount = currentAfterDelete.length;
  const remaining = Math.max(maxFilesAllowed - currentCount, 0);

  const incomingCount = Array.isArray(files) ? files.length : 0;

  // Tidak upload file → tidak boleh lanjut
  if (incomingCount === 0) {
    return {
      ok: false,
      http: 422,
      code: "FILES_NOT_FOUND",
      title: "File Tidak Ditemukan",
      desc: "File evidence wajib diunggah.",
    };
  }

  // Sudah penuh tapi masih ada file yang dikirim
  // if (remaining === 0) {
  //   return {
  //     ok: false,
  //     http: 422,
  //     code: "MAX_CAPACITY",
  //     title: "Kapasitas Sudah Penuh",
  //     desc: "Kapasitas file untuk data ini sudah terpenuhi. Tidak ada slot tersisa.",
  //   };
  // }

  // Jika payload melebihi sisa slot → kembalikan info berapa yang boleh
  if (incomingCount > remaining) {
    const s = remaining;
    return {
      ok: false,
      http: 422,
      code: "UPLOAD_LIMIT_EXCEEDED",
      title: "Terlalu Banyak File",
      desc: `File yang diperbolehkan di upload adalah ${s} file.`,
    };
  }

  // Validasi tipe & ukuran per file
  for (const f of files) {
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
        )}MB.`,
      };
    }
  }

  return { ok: true, remaining };
}

function handleBudgetRealizationArray(rawContent, opts = {}) {
  const {
    allowEmpty = false,
    maxNameLen = 100,
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
      `Setiap elemen ${fieldLabel} harus objek { name, value:number } dan minimal satu elemen valid.`
    );
    return { error: err };
  }

  // Kembalikan array JS murni (bukan string) → cocok untuk JSONB
  return { value: cleaned };
}
