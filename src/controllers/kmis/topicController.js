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
const documentHelper = require("../../helpers/DocumentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const topicResource = require("../../resources/kmis/topicResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("kmis_topics as topic")
      .select(
        "topic.id",
        "topic.kmis_categories_id",
        "topic.topic_cover_ids",
        "topic.title",
        "topic.description",
        "topic.deleted_at",
        "topic.created_at",
        "topic.updated_at"
      )
      .leftJoin(
        "kmis_categories as category",
        "topic.kmis_categories_id",
        "category.id"
      )
      .orderBy("topic.created_at", "desc");

    applyTrashedScope(query, req, "topic.deleted_at");

    applySearch(query, search, ["topic.title", "category.title"]);

    const paginationInfo = applyPagination(query, req.query);

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
      result.data.map((category) => topicResource(category))
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
  const { title, description, categoryId } = req.body;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((err) => err.msg)
        .join(" ");
      const response = new WithoutDataResource(
        400,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(400).json(response.toResponse());
    }

    if (!req.files || req.files.length === 0) {
      const response = new WithoutDataResource(
        400,
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "File cover wajib diunggah."
      );
      return res.status(400).json(response.toResponse());
    }
    if (req.files.length > 1) {
      const response = new WithoutDataResource(
        400,
        "MAX_FILES",
        "Terlalu Banyak File",
        "Maksimal upload adalah 1 file."
      );
      return res.status(400).json(response.toResponse());
    }

    for (const file of req.files) {
      const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
      if (!allowedTypes.includes(file.mimetype)) {
        const response = new WithoutDataResource(
          400,
          "INVALID_FILE_TYPE",
          "Tipe File Salah",
          "File File hanya boleh JPG, JPEG, atau PNG."
        );
        return res.status(400).json(response.toResponse());
      }
      if (file.size > 10 * 1024 * 1024) {
        const response = new WithoutDataResource(
          400,
          "FILE_TOO_LARGE",
          "Ukuran File Terlalu Besar",
          "Ukuran maksimal tiap file adalah 10MB."
        );
        return res.status(400).json(response.toResponse());
      }
    }

    const exists = await trx("kmis_topics")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul topik '${title}' sudah digunakan. Silakan gunakan judul lain.`
      );
      return res.status(400).json(response.toResponse());
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
        title,
        description,
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
  const { title, description, categoryId, deleteDocumentIds } = req.body;
  const id = req.params.id;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const message = errors
        .array()
        .map((err) => err.msg)
        .join(" ");
      const response = new WithoutDataResource(
        400,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(400).json(response.toResponse());
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

    const duplicate = await trx("kmis_topics")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul '${title}' sudah digunakan pada topik lain.`
      );
      return res.status(400).json(response.toResponse());
    }

    const oldCoverIds = normJsonbArray(existing.topic_cover_ids);
    const oldDocId = normIdArray(oldCoverIds, { as: "number" })[0] ?? null;

    const deletedIds = toArray(deleteDocumentIds).map(String);

    let finalDocId = oldDocId;
    console.log("oldDocId: ", oldDocId);
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

    await trx("kmis_topics")
      .where("id", id)
      .update({
        kmis_categories_id: categoryId,
        topic_cover_ids: asJsonb(coverArr),
        title,
        description,
        updated_at: trx.fn.now(),
      });

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
  const id = req.params.id;

  try {
    const existing = await trx("kmis_topics").where("id", id).first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Topik dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    await trx("kmis_topics").where("id", id).update({
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
      `Data topik '${existing.title}' berhasil dihapus (soft delete).`
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
  const { id } = req.params;
  const trx = await knex.transaction();

  try {
    const deletedCategory = await trx("kmis_topics")
      .where("id", id)
      .whereNotNull("deleted_at")
      .first();
    if (!deletedCategory) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Topik dengan ID '${id}' tidak ditemukan atau belum dihapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const isDuplicate = await trx("kmis_topics")
      .whereRaw("lower(title) = lower(?)", [deletedCategory.title])
      .whereNull("deleted_at")
      .first();
    if (isDuplicate) {
      await trx.rollback();
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_NAME",
        "Duplikat Data",
        `Judul topik '${deletedCategory.title}' sudah digunakan oleh entri aktif lain. Silakan ubah nama terlebih dahulu sebelum merestore.`
      );
      return res.status(400).json(response.toResponse());
    }

    await trx("kmis_topics").where("id", id).update({
      deleted_at: null,
      updated_at: trx.fn.now(),
    });

    await activityLogHelper.logRestore(
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
      "SUCCESS_RESTORE_DATA",
      "Berhasil Mengembalikan Data",
      `Data topik '${deletedCategory.title}' berhasil dikembalikan.`
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
