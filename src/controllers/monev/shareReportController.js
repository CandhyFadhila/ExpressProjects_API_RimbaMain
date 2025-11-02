const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  toArray,
  normJsonbArray,
  normIdArray,
} = require("../../helpers/inputNorm");
const { asJsonb } = require("../../helpers/dbJson");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const shareReportResource = require("../../resources/monev/shareReportResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("monev_share_reports as report").select("report.*");

    applyTrashedScope(query, req, "report.deleted_at");

    applySearch(query, search, ["report.name"]);

    applyLatestThenTrashed(
      query,
      "report.deleted_at",
      "report.created_at",
      "report.id"
    );

    const paginationInfo = applyPagination(req.query);

    const result = await formatPaginationResult(query, paginationInfo, knex);
    if (result.data.length === 0) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Tidak ada data yang sesuai dengan filter atau pencarian."
      );
      return res.status(200).json(response.toResponse());
    }

    const serializedData = await Promise.all(
      result.data.map((report) => shareReportResource(report))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data laporan berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Share Report MONEV | - Error function index : ${error.message}`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silakan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
};

exports.store = async (req, res) => {
  const trx = await knex.transaction();
  const { name, description } = req.body;
  const userId = activityLogHelper.fromReq(req);

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

    const exists = await trx("monev_share_reports")
      .whereRaw("lower(name) = lower(?)", [name])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Nama laporan '${name}' sudah digunakan. Silakan gunakan judul lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    if (!req.files || req.files.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "File laporan wajib diunggah."
      );
      return res.status(422).json(response.toResponse());
    }
    if (req.files.length > 5) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "MAX_FILES",
        "Terlalu Banyak File",
        "Maksimal upload adalah 5 file."
      );
      return res.status(422).json(response.toResponse());
    }

    for (const file of req.files) {
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        const response = new WithoutDataResource(
          422,
          "INVALID_FILE_TYPE",
          "Tipe File Salah",
          "File File hanya boleh JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX."
        );
        return res.status(422).json(response.toResponse());
      }
      if (file.size > 10 * 1024 * 1024) {
        const response = new WithoutDataResource(
          422,
          "FILE_TOO_LARGE",
          "Ukuran File Terlalu Besar",
          "Ukuran maksimal tiap file adalah 10MB."
        );
        return res.status(422).json(response.toResponse());
      }
    }

    const uploadedDocuments = await documentHelper.uploadDocuments(
      req.files,
      req
    );
    const filesFromBody = normIdArray(req.body.files, {
      as: "number",
    });
    const fileIds = filesFromBody.length ? filesFromBody : uploadedDocuments;

    await trx("monev_share_reports")
      .insert({
        created_by: userId,
        report_file_ids: asJsonb(fileIds),
        name,
        description,
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "List Laporan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data laporan '${name}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Share Report MONEV | - Error function store: ${error.message}`
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

exports.show = async (req, res) => {
  const { id } = req.params;

  try {
    const report = await knex("monev_share_reports")
      .select("*")
      .where("id", id)
      .first();
    if (!report) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data laporan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await shareReportResource(report);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data laporan '${report.name}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Share Report MONEV | - Error function show: ${error.message}`
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
  const { name, description, deleteDocumentIds } = req.body;
  const id = req.params.id;
  const userId = activityLogHelper.fromReq(req);

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

    const existing = await trx("monev_share_reports").where("id", id).first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data laporan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    if (Number(existing.created_by) !== Number(userId)) {
      await trx.rollback();
      const response = new WithoutDataResource(
        403,
        "FORBIDDEN_USER_ID",
        "User Tidak Diizinkan",
        "Anda tidak memiliki izin untuk memperbarui laporan ini karena bukan pembuatnya."
      );
      return res.status(403).json(response.toResponse());
    }

    const duplicate = await trx("monev_share_reports")
      .whereRaw("lower(name) = lower(?)", [name])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Nama '${name}' sudah digunakan pada laporan lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    const deletedIds = toArray(deleteDocumentIds).map(String);
    const incomingFiles = Array.isArray(req.files) ? req.files : [];

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];

    const validation = await validateFilesQuotaAndTypesOnUpdate({
      existingRow: existing,
      deleteDocumentIds: deletedIds,
      files: incomingFiles,
      dbColumn: "report_file_ids",
      maxFilesAllowed: 5,
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

    const current = normIdArray(normJsonbArray(existing.report_file_ids), {
      as: "number",
    });
    const toDeleteSet = new Set(deletedIds.map((x) => Number(x)));

    const idxs = [];
    for (let i = 0; i < current.length; i++) {
      if (toDeleteSet.has(current[i])) idxs.push(i);
    }

    let uploadIds = [];
    if (incomingFiles.length > 0) {
      uploadIds = await documentHelper.uploadDocuments(incomingFiles, req);
    }
    const newDocIds = (uploadIds || [])
      .map((x) => Number(x))
      .filter(Number.isFinite);

    let finalArr = [...current];

    const replaceCount = Math.min(idxs.length, newDocIds.length);
    for (let r = 0; r < replaceCount; r++) {
      finalArr[idxs[r]] = newDocIds[r];
    }

    if (idxs.length > replaceCount) {
      const extraIdxs = idxs.slice(replaceCount);
      for (let k = extraIdxs.length - 1; k >= 0; k--) {
        finalArr.splice(extraIdxs[k], 1);
      }
    }

    if (newDocIds.length > replaceCount) {
      finalArr = finalArr.concat(newDocIds.slice(replaceCount));
    }

    finalArr = finalArr
      .filter((x) => Number.isFinite(Number(x)))
      .map((x) => Number(x));

    const updateData = {
      report_file_ids: asJsonb(finalArr),
      name: name ?? existing.name,
      description: description ?? existing.description,
      updated_at: trx.fn.now(),
    };

    await trx("monev_share_reports").where("id", id).update(updateData);

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "List Laporan",
      },
      trx
    );

    await trx.commit();

    const toDeleteExisting = current.filter((x) => toDeleteSet.has(x));
    if (toDeleteExisting.length > 0) {
      try {
        await documentHelper.deleteDocuments(toDeleteExisting);
      } catch (e) {
        logger.warn(
          `| Share Report MONEV | - Gagal menghapus sebagian dokumen: ${e.message}`
        );
      }
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data laporan '${name}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Share Report MONEV | - Error function update : ${error.message}`
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

// TODO: Ubah menjadi delete permanen
exports.destroy = async (req, res) => {
  const trx = await knex.transaction();

  try {
    const ids = normIdArray(req.body?.deleteIds, { as: "number" }).filter(
      Number.isFinite
    );
    if (ids.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "INVALID_INPUT",
        "Gagal Menghapus Data",
        "Mohon kirimkan deleteIds berupa array ID numerik, misal: [1,2,3]."
      );
      return res.status(422).json(response.toResponse());
    }

    const MAX_BULK = 50;
    if (ids.length > MAX_BULK) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "TOO_MANY_IDS",
        "Terlalu Banyak Data",
        `Maksimal id yang bisa dihapus adalah ${MAX_BULK} ID.`
      );
      return res.status(422).json(response.toResponse());
    }

    const existing = await trx("monev_share_reports")
      .select("id", "name")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data laporan yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("monev_share_reports").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "List Laporan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data laporan.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Share Report MONEV | - Error function destroy : ${error.message}`
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

exports.restore = async (req, res) => {
  const trx = await knex.transaction();

  try {
    const ids = normIdArray(req.body?.restoreIds, { as: "number" }).filter(
      Number.isFinite
    );
    if (ids.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "INVALID_INPUT",
        "Gagal Menghapus Data",
        "Mohon kirimkan restoreIds berupa array ID numerik, misal: [1,2,3]."
      );
      return res.status(422).json(response.toResponse());
    }

    const MAX_BULK = 50;
    if (ids.length > MAX_BULK) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "TOO_MANY_IDS",
        "Terlalu Banyak Data",
        `Maksimal id yang bisa dikembalikan adalah ${MAX_BULK} ID.`
      );
      return res.status(422).json(response.toResponse());
    }

    const softDeleted = await trx("monev_share_reports")
      .select("id", "name")
      .whereIn("id", ids)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data laporan terhapus yang cocok untuk direstore.`
      );
      return res.status(200).json(response.toResponse());
    }

    // 1) Cek bentrok judul dengan entri aktif
    const namesLower = softDeleted.map((r) => r.name?.toLowerCase?.() ?? "");
    const activeWithSameTitle = await trx("monev_share_reports")
      .select(knex.raw("lower(name) AS lname"))
      .whereNull("deleted_at")
      .whereIn(knex.raw("lower(name)"), namesLower);

    const conflictActive = new Set(activeWithSameTitle.map((r) => r.lname));

    // 2) Cek duplikat judul di dalam batch restore sendiri
    const seenBatch = new Set();
    const duplicateInBatch = new Set();
    for (const r of softDeleted) {
      const lt = (r.name || "").toLowerCase();
      if (seenBatch.has(lt)) duplicateInBatch.add(lt);
      else seenBatch.add(lt);
    }

    // 3) Tentukan mana yang boleh direstore (tidak bentrok & bukan duplikat batch)
    const restorable = [];
    const skippedConflicts = [];
    const takenInBatch = new Set(); // untuk hanya ambil satu per name di batch

    for (const r of softDeleted) {
      const lt = (r.name || "").toLowerCase();
      const hasActiveConflict = conflictActive.has(lt);
      const hasBatchDup = duplicateInBatch.has(lt);

      if (hasActiveConflict || hasBatchDup) {
        skippedConflicts.push({ id: r.id, name: r.name });
        continue;
      }
      if (takenInBatch.has(lt)) {
        skippedConflicts.push({ id: r.id, name: r.name });
        continue;
      }
      takenInBatch.add(lt);
      restorable.push(r);
    }

    // 4) Eksekusi restore
    let restoredCount = 0;
    if (restorable.length > 0) {
      const idsToRestore = restorable.map((r) => r.id);
      await trx("monev_share_reports")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "monev",
        subject: "List Laporan",
      },
      trx
    );

    await trx.commit();

    if (restoredCount === 0) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_NAME",
        "Restore Gagal",
        "Semua ID gagal direstore karena duplikat data dengan entri aktif atau duplikat data di dalam batch."
      );
      return res.status(422).json(response.toResponse());
    }

    const descParts = [
      `Berhasil mengembalikan ${restoredCount} data yang terhapus.`,
    ];
    if (skippedConflicts.length) {
      descParts.push(
        `Terlewat ${skippedConflicts.length} karena bentrok/duplikat data.`
      );
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_RESTORE_DATA",
      "Berhasil Mengembalikan Data",
      descParts.join(" ")
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Share Report MONEV | - Error function restore: ${error.message}`
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

async function validateFilesQuotaAndTypesOnUpdate({
  existingRow,
  deleteDocumentIds,
  files,
  dbColumn = "report_file_ids",
  maxFilesAllowed = 5,
  allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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
        desc: `File hanya boleh bertipe: JPG, JPEG, PNG, WebP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX.`,
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
