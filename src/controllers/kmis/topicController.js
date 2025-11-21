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
  applyRelationIn,
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const topicResource = require("../../resources/kmis/topicResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

exports.index = async (req, res) => {
  const { search, categoryId, topicType } = req.query;
  const categoryIdAny = categoryId ?? req.query["categoryId[]"];
  const topicTypeAny = topicType ?? req.query["topicType[]"];

  try {
    let query = knex("kmis_topics as topic")
      .leftJoin(
        "kmis_categories as category",
        "topic.kmis_categories_id",
        "category.id"
      )
      .select("topic.*");

    applyTrashedScope(query, req, "topic.deleted_at");

    applyRelationIn(query, "topic.kmis_categories_id", categoryIdAny, {
      as: "number",
    });

    applyRelationIn(query, "topic.topic_type", topicTypeAny, {
      as: "string",
    });

    applySearch(query, search, ["topic.title", "category.title"]);

    applyLatestThenTrashed(
      query,
      "topic.deleted_at",
      "topic.created_at",
      "topic.id"
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
      result.data.map((topic) => topicResource(topic))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data topik berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Topic KMIS | - Error function index : ${error.message}`);
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
  const {
    categoryId,
    topicType,
    isPublic,
    title,
    description,
    totalQuiz,
    quizDuration,
  } = req.body;

  try {
    if (quizDuration < 300) {
      const response = new WithoutDataResource(
        422,
        "INVALID_QUIZ_DURATION",
        "Durasi Quiz Terlalu Pendek",
        "Durasi quiz minimal adalah 5 menit (300 detik)."
      );
      return res.status(422).json(response.toResponse());
    }

    if (isPublic) {
      if (topicType !== "Pengetahuan") {
        const response = new WithoutDataResource(
          422,
          "INVALID_TOPIC_TYPE",
          "Tipe Topik Salah",
          "Jika isPublic true, topicType harus berisi 'Pengetahuan'."
        );
        return res.status(422).json(response.toResponse());
      }
    } else {
      if (topicType !== "Pelatihan") {
        const response = new WithoutDataResource(
          422,
          "INVALID_TOPIC_TYPE",
          "Tipe Topik Salah",
          "Jika isPublic false, topicType harus berisi 'Pelatihan'."
        );
        return res.status(422).json(response.toResponse());
      }
    }

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

    const exists = await trx("kmis_topics")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul topik '${title}' sudah digunakan. Silakan gunakan judul lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    if (!req.files || req.files.length === 0) {
      const response = new WithoutDataResource(
        422,
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "File cover wajib diunggah."
      );
      return res.status(422).json(response.toResponse());
    }
    if (req.files.length > 1) {
      const response = new WithoutDataResource(
        422,
        "MAX_FILES",
        "Terlalu Banyak File",
        "Maksimal upload adalah 1 file."
      );
      return res.status(422).json(response.toResponse());
    }

    for (const file of req.files) {
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        const response = new WithoutDataResource(
          422,
          "INVALID_FILE_TYPE",
          "Tipe File Salah",
          "File File hanya boleh JPG, JPEG, PNG, dan WebP."
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
    const firstId = uploadedDocuments?.[0];
    const coverId = Number(firstId);

    await trx("kmis_topics")
      .insert({
        kmis_categories_id: categoryId,
        topic_cover_ids: asJsonb([coverId]),
        topic_type: topicType,
        is_public: isPublic,
        title,
        description,
        total_quiz: totalQuiz,
        quiz_duration: quizDuration,
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Topik",
        // notes: `Judul = '${title}'`, // opsional bisa dicomment jika gak dipake
        // description: "override manual", // jika mau override template
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data topik '${title}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Topic KMIS | - Error function store: ${error.message}`);
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
    const topic = await knex("kmis_topics").select("*").where("id", id).first();
    if (!topic) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data topik dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await topicResource(topic);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data topik '${topic.title}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Topic KMIS | - Error function show: ${error.message}`);
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
  const {
    categoryId,
    topicType,
    isPublic,
    title,
    description,
    totalQuiz,
    quizDuration,
    materialOrderIds,
    deleteDocumentIds,
  } = req.body;
  const id = req.params.id;

  try {
    if (quizDuration < 300) {
      const response = new WithoutDataResource(
        422,
        "INVALID_QUIZ_DURATION",
        "Durasi Quiz Terlalu Pendek",
        "Durasi quiz minimal adalah 5 menit (300 detik)."
      );
      return res.status(422).json(response.toResponse());
    }

    if (isPublic) {
      if (topicType !== "Pengetahuan") {
        const response = new WithoutDataResource(
          422,
          "INVALID_TOPIC_TYPE",
          "Tipe Topik Salah",
          "Jika isPublic true, topicType harus berisi 'Pengetahuan'."
        );
        return res.status(422).json(response.toResponse());
      }
    } else {
      if (topicType !== "Pelatihan") {
        const response = new WithoutDataResource(
          422,
          "INVALID_TOPIC_TYPE",
          "Tipe Topik Salah",
          "Jika isPublic false, topicType harus berisi 'Pelatihan'."
        );
        return res.status(422).json(response.toResponse());
      }
    }

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

    const incomingMaterialOrderIds = toArray(materialOrderIds).map(String);
    if (incomingMaterialOrderIds && incomingMaterialOrderIds.length > 0) {
      const invalidMaterialIds = await trx("kmis_materials")
        .whereIn("id", incomingMaterialOrderIds)
        .select("id")
        .then((materials) => {
          const validIds = materials.map((m) => m.id);
          return incomingMaterialOrderIds.filter(
            (id) => !validIds.includes(id)
          );
        });

      if (invalidMaterialIds.length > 0) {
        const response = new WithoutDataResource(
          422,
          "INVALID_MATERIAL_IDS",
          "ID Material Tidak Valid",
          `ID material berikut tidak ditemukan di database: ${invalidMaterialIds.join(
            ", "
          )}.`
        );
        return res.status(422).json(response.toResponse());
      }
    }

    const existing = await trx("kmis_topics").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data topik dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingMaterialOrderIds = normJsonbArray(
      existing.material_order_ids
    ).map(String);

    // Cek apakah keduanya memiliki ID yang sama
    const areArraysEqual = (arr1, arr2) => {
      return arr1.sort().join(",") === arr2.sort().join(",");
    };

    if (!areArraysEqual(existingMaterialOrderIds, incomingMaterialOrderIds)) {
      const response = new WithoutDataResource(
        422,
        "MATERIAL_ORDER_IDS_MISMATCH",
        "ID Material Tidak Sesuai",
        `ID material dalam 'materialOrderIds' tidak sesuai dengan data yang ada sebelumnya.`
      );
      return res.status(422).json(response.toResponse());
    }

    const duplicate = await trx("kmis_topics")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul '${title}' sudah digunakan pada topik lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    const deletedIds = toArray(deleteDocumentIds).map(String);
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const validation = await validateFilesQuotaAndTypesOnUpdate({
      existingRow: existing,
      deleteDocumentIds: deletedIds,
      files: Array.isArray(req.files) ? req.files : [],
      dbColumn: "topic_cover_ids",
      maxFilesAllowed: 1,
      allowedTypes,
      sizeLimitBytes: 50 * 1024 * 1024, // 50MB
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

    const oldCoverIds = normJsonbArray(existing.topic_cover_ids);
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

    const coverId = uploadIds?.[0] ?? finalDocId ?? null;
    const coverArr = coverId != null ? [Number(coverId)] : [];

    const updateData = {
      kmis_categories_id: categoryId,
      topic_cover_ids: asJsonb(coverArr),
      topic_type: topicType,
      is_public: isPublic,
      title,
      description,
      total_quiz: totalQuiz,
      quiz_duration: quizDuration,
      updated_at: trx.fn.now(),
    };

    if (materialOrderIds !== undefined) {
      updateData.material_order_ids = knex.raw("?", [materialOrderIds]);
    }

    await trx("kmis_topics").where("id", id).update(updateData);

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Topik",
        // notes: `Judul = '${title}'`, // opsional bisa dicomment jika gak dipake
        // description: "override manual", // jika mau override template
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data topik '${title}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Topic KMIS | - Error function update : ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem. Silakan coba lagi nanti."
    );
    return res.status(500).json(response.toResponse());
  }
};

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

    const existing = await trx("kmis_topics")
      .select("id", "title")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data topik yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("kmis_topics").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Topik",
        // notes: `Judul = '${title}'`, // opsional bisa dicomment jika gak dipake
        // description: "override manual", // jika mau override template
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data topik.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Topic KMIS | - Error function destroy : ${error.message}`);
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

    const softDeleted = await trx("kmis_topics")
      .select("id", "title")
      .whereIn("id", ids)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data topik terhapus yang cocok untuk direstore.`
      );
      return res.status(200).json(response.toResponse());
    }

    // 1) Cek bentrok judul dengan entri aktif
    const titlesLower = softDeleted.map((r) => r.title?.toLowerCase?.() ?? "");
    const activeWithSameTitle = await trx("kmis_topics")
      .select(knex.raw("lower(title) AS ltitle"))
      .whereNull("deleted_at")
      .whereIn(knex.raw("lower(title)"), titlesLower);

    const conflictActive = new Set(activeWithSameTitle.map((r) => r.ltitle));

    // 2) Cek duplikat judul di dalam batch restore sendiri
    const seenBatch = new Set();
    const duplicateInBatch = new Set();
    for (const r of softDeleted) {
      const lt = (r.title || "").toLowerCase();
      if (seenBatch.has(lt)) duplicateInBatch.add(lt);
      else seenBatch.add(lt);
    }

    // 3) Tentukan mana yang boleh direstore (tidak bentrok & bukan duplikat batch)
    const restorable = [];
    const skippedConflicts = [];
    const takenInBatch = new Set(); // untuk hanya ambil satu per title di batch

    for (const r of softDeleted) {
      const lt = (r.title || "").toLowerCase();
      const hasActiveConflict = conflictActive.has(lt);
      const hasBatchDup = duplicateInBatch.has(lt);

      if (hasActiveConflict || hasBatchDup) {
        skippedConflicts.push({ id: r.id, title: r.title });
        continue;
      }
      if (takenInBatch.has(lt)) {
        skippedConflicts.push({ id: r.id, title: r.title });
        continue;
      }
      takenInBatch.add(lt);
      restorable.push(r);
    }

    // 4) Eksekusi restore
    let restoredCount = 0;
    if (restorable.length > 0) {
      const idsToRestore = restorable.map((r) => r.id);
      await trx("kmis_topics")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Topik",
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
    logger.error(`| Topic KMIS | - Error function restore: ${error.message}`);
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
  dbColumn = "topic_cover_ids",
  maxFilesAllowed = 1,
  allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  sizeLimitBytes = 50 * 1024 * 1024,
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
        desc: `File hanya boleh bertipe: JPG, JPEG, PNG, dan WebP.`,
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
