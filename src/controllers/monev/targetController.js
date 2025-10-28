const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const targetResource = require("../../resources/monev/targetResource");
const activityLogHelper = require("../../helpers/activityLogHelper");

exports.getTargetbyActivityPackageId = async (req, res) => {
  const { id } = req.params;

  try {
    const activityPackage = await knex("monev_activity_packages")
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

    const originals = await knex("monev_targets")
      .where("monev_activity_packages_id", id)
      .whereNull("deleted_at")
      .orderBy("created_at", "desc");

    const pendings = await knex("monev_target_pending_updates")
      .where("monev_activity_packages_id", id)
      .whereNull("deleted_at")
      .orderBy("created_at", "desc");

    const monevTargetOriginal = await Promise.all(
      originals.map((row) => targetResource(row, { activityPackage }))
    );
    const monevTargetPendingUpdate = await Promise.all(
      pendings.map((row) => targetResource(row, { activityPackage }))
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

    const result = await updateTarget(trx, { id, payload, userId });

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

/**
 * updateTarget
 * Alur:
 * - Jika kedua kolom existing (budged_target & physical_target) masih 0/null => UPDATE langsung ke monev_targets
 * - Jika salah satu sudah terisi (≠ 0 / tidak null) => INSERT ke monev_target_pending_updates + set monev_targets.validation_status = 1
 */
async function updateTarget(trx, { id, payload, userId }) {
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

  // normalisasi nilai masuk
  const budgedTarget = toNonNegInt(
    payload.budgedTarget ?? payload.budgedTarget
  );
  const physicalTarget = toNonNegFloat(payload.physicalTarget);
  const { description } = payload;

  const existing = await trx("monev_targets")
    .select([
      "id",
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

  const bothEmpty =
    isNullOrZero(existing.budged_target) &&
    isNullOrZero(existing.physical_target);

  if (bothEmpty) {
    // === JALUR UPDATE LANGSUNG ===
    const patch = { updated_at: now };
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

  // === JALUR PENDING UPDATE ===
  // Nilai kandidat pending (fallback ke nilai existing bila field tak dikirim)
  const candidate = {
    monev_target_id: id,
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

  // Jika validation_status === 1 pada monev_targets dan sudah ada pending utk target ini:
  // -> REPLACE: update baris pending terbaru & soft-delete duplikat lainnya (bila ada)
  if (existing.validation_status === 1) {
    const latestPending = await trx("monev_target_pending_updates")
      .where({ monev_target_id: id })
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
      .first();

    if (latestPending) {
      // update baris pending yg ada
      await trx("monev_target_pending_updates")
        .where("id", latestPending.id)
        .update({
          ...candidate,
          updated_at: now,
        });

      // soft delete sibling lain (jika ada yang numpuk)
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
    // jika status=1 tapi belum ada pending baris (edge case), lanjut insert baru di bawah
  }

  // Insert pending baru
  const pendingRow = {
    ...candidate,
    created_at: now,
    updated_at: now,
  };

  const inserted = await trx("monev_target_pending_updates")
    .insert(pendingRow)
    .returning(["id"]);
  const pendingId = Array.isArray(inserted)
    ? typeof inserted[0] === "object"
      ? inserted[0].id
      : inserted[0]
    : null;

  // Pastikan monev_targets.validation_status = 1 (menunggu validasi) saat ada pending
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
