const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { orderByMonthName } = require("../../helpers/orderByMonthName");
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

    const { sql, bindings } = orderByMonthName("month", "asc");

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
    budgedTarget: req.body.budgedTarget,
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
        `Akun dengan id '${id}' tidak ditemukan.`
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
        "budged_target",
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
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Target dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    if (existing.validation_status === 2 || existing.validation_status === 3) {
      const statusMap = { 1: "Pending", 2: "Approve", 3: "Rejected" };
      const response = new WithoutDataResource(
        200,
        "ALREADY_VALIDATED",
        "Sudah Divalidasi",
        `Target bulan '${existing.month}' sudah berstatus ${
          statusMap[existing.validation_status]
        }.`
      );
      return res.status(200).json(response.toResponse());
    }

    const result = await verifyTarget(trx, { id, payload, userId });

    await trx.commit();

    // approved
    if (result.mode === "approved") {
      const response = new WithoutDataResource(
        200,
        "SUCCESS_APPROVE",
        "Berhasil Approve",
        `Target bulan '${result.month}' berhasil disetujui dan diperbarui.`
      );
      return res.status(200).json(response.toResponse());
    }

    // rejected
    const response = new WithoutDataResource(
      200,
      "SUCCESS_REJECT",
      "Berhasil Reject",
      `Target bulan '${result.month}' ditolak dengan alasan: ${payload.rejectionReason}.`
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
 * - Jika kedua kolom existing (budged_target & physical_target) masih 0/null => UPDATE langsung ke monev_targets
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

  const budgedTarget = toNonNegInt(payload.budgedTarget);
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
      "budged_target",
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
    if (isProvided(budgedTarget)) patch.budged_target = budgedTarget;
    if (isProvided(physicalTarget)) patch.physical_target = physicalTarget;
    if (isProvided(description)) patch.description = description;

    await trx("monev_targets").where("id", id).update(patch);

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Target Kegiatan Bulan '${existing.month}' (update langsung oleh superadmin)`,
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
    isNullOrZero(existing.budged_target) &&
    isNullOrZero(existing.physical_target);

  if (bothEmpty) {
    // === UPDATE LANGSUNG (pertama kali diisi) ===
    const patch = {
      updated_at: now,
      edited_by: userId,
    };
    if (isProvided(budgedTarget)) patch.budged_target = budgedTarget;
    if (isProvided(physicalTarget)) patch.physical_target = physicalTarget;
    if (isProvided(description)) patch.description = description;

    await trx("monev_targets").where("id", id).update(patch);

    await activityLogHelper.logUpdate(
      {
        userId,
        module: "monev",
        subject: `Target Kegiatan Bulan '${existing.month}' (update langsung)`,
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
    budged_target: isProvided(budgedTarget)
      ? budgedTarget
      : existing.budged_target,
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
          subject: `Target Kegiatan Bulan '${existing.month}' (pending update replaced)`,
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
      subject: `Target Kegiatan Bulan '${existing.month}' (pending update)`,
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
    .select(["id", "month"])
    .where("id", id)
    .first();
  if (!target) {
    const err = new Error("Target not found");
    err.code = "TARGET_NOT_FOUND";
    throw err;
  }

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
      budged_target: latestPending.budged_target,
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
        subject: `Verifikasi Target Bulan '${target.month}' (APPROVED)`,
      },
      trx
    );

    return { mode: "approved", month: target.month, patch };
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
      subject: `Verifikasi Target Bulan '${target.month}' (REJECTED)`,
    },
    trx
  );

  return { mode: "rejected", month: target.month, patch: patchReject };
}
