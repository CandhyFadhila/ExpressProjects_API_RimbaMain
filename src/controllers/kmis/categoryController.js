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
const categoryResource = require("../../resources/kmis/categoryResource");

exports.index = async (req, res) => {
  const { search, with_trashed } = req.query;

  try {
    // --- cek otorisasi untuk with_trashed ---
    const roleName = String(req?.auth?.roleName || "").toLowerCase();
    const abilities = (req?.auth?.abilities || []).map((a) =>
      String(a).toLowerCase()
    );
    const isSuperAdmin =
      roleName === "super admin" || abilities.includes("super_admin");

    if (with_trashed === "1" && !isSuperAdmin) {
      const response = new WithoutDataResource(
        403,
        "FORBIDDEN_TRASHED_FILTER",
        "Akses Ditolak",
        "Anda tidak berizin melihat data yang telah dihapus."
      );
      return res.status(403).json(response.toResponse());
    }
    // ---------------------------------------

    let query = knex("kmis_categories as category")
      .select(
        "category.id",
        "category.category_cover_ids",
        "category.title",
        "category.description",
        "category.deleted_at",
        "category.created_at",
        "category.updated_at"
      )
      .orderBy("category.created_at", "desc");

    if (with_trashed !== "1") {
      query.whereNull("category.deleted_at");
    }

    applySearch(query, search, ["category.title"]);

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
      result.data.map((category) => categoryResource(category))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kategori berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Category KMIS | - Error function index : ${error.message}`);
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
  const { title, description } = req.body;

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

    const exists = await trx("kmis_categories")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul kategori '${title}' sudah digunakan. Silakan gunakan judul lain.`
      );
      return res.status(400).json(response.toResponse());
    }

    const uploadedDocuments = await documentHelper.uploadDocuments(
      req.files,
      req
    );
    const firstId = uploadedDocuments?.[0];
    const coverId = Number(firstId);

    await trx("kmis_categories")
      .insert({
        category_cover_ids: asJsonb([coverId]),
        title,
        description,
      })
      .returning("*");

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data kategori '${title}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Category KMIS | - Error function store: ${error.message}`);
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
    const category = await knex("kmis_categories")
      .select("*")
      .where("id", id)
      .first();
    if (!category) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await categoryResource(category);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kategori '${category.title}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Category KMIS | - Error function show: ${error.message}`);
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
  const { title, description, deleteDocumentIds } = req.body;
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

    const existing = await trx("kmis_categories").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const duplicate = await trx("kmis_categories")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul '${title}' sudah digunakan pada kategori lain.`
      );
      return res.status(400).json(response.toResponse());
    }

    const oldCoverIds = normJsonbArray(existing.category_cover_ids);
    const oldDocId = normIdArray(oldCoverIds, { as: "number" })[0] ?? null;

    const deletedIds = toArray(req.body.deleteDocumentIds).map(String);

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

    await trx("kmis_categories")
      .where("id", id)
      .update({
        category_cover_ids: asJsonb(coverArr),
        title,
        description,
        updated_at: trx.fn.now(),
      });

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data kategori '${title}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Category KMIS | - Error function update : ${error.message}`
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

exports.destroy = async (req, res) => {
  const trx = await knex.transaction();
  const id = req.params.id;

  try {
    const existing = await trx("kmis_categories").where("id", id).first();
    if (!existing) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Kategori dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    await trx("kmis_categories").where("id", id).update({
      deleted_at: trx.fn.now(),
    });

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Data kategori '${existing.title}' berhasil dihapus (soft delete).`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Categories | - Error function destroy : ${error.message}`);
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
    const deletedCategory = await trx("kmis_categories")
      .where("id", id)
      .whereNotNull("deleted_at")
      .first();
    if (!deletedCategory) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Kategori dengan ID '${id}' tidak ditemukan atau belum dihapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const isDuplicate = await trx("kmis_categories")
      .whereRaw("lower(title) = lower(?)", [deletedCategory.title])
      .whereNull("deleted_at")
      .first();
    if (isDuplicate) {
      await trx.rollback();
      const response = new WithoutDataResource(
        400,
        "DUPLICATE_NAME",
        "Duplikat Data",
        `Judul kategori '${deletedCategory.title}' sudah digunakan oleh entri aktif lain. Silakan ubah nama terlebih dahulu sebelum merestore.`
      );
      return res.status(400).json(response.toResponse());
    }

    await trx("kmis_categories").where("id", id).update({
      deleted_at: null,
      updated_at: trx.fn.now(),
    });

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_RESTORE_DATA",
      "Berhasil Mengembalikan Data",
      `Data kategori '${deletedCategory.title}' berhasil dikembalikan.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Categories | - Error function restore: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};
