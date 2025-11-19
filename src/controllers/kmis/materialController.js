const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { normJsonbArray, normIdArray } = require("../../helpers/inputNorm");
const { asJsonb } = require("../../helpers/dbJson");
const {
  applyRelationIn,
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const { toYoutubeEmbed } = require("../../helpers/toYoutubeEmbed");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");
const materialResource = require("../../resources/kmis/materialResource");

exports.index = async (req, res) => {
  const { search, topicId } = req.query;
  const topicIdAny = topicId ?? req.query["topicId[]"];
  const userIdRaw =
    req.auth?.userId ??
    req.auth?.user_id ??
    req.auth?.id ??
    req.userId ??
    req.user?.id;

  const userId = Number(userIdRaw);

  try {
    const user = await knex("users")
      .select("id", "role_id")
      .where({ id: userId })
      .first();
    if (!user) {
      const response = new WithoutDataResource(
        401,
        "USER_NOT_FOUND",
        "Akses Ditolak",
        "Pengguna tidak ditemukan di sistem. Silakan hubungi admin."
      );
      return res.status(401).json(response.toResponse());
    }

    const roleId = Number(user.role_id);

    let query = knex("kmis_materials as material")
      .leftJoin("kmis_topics as topic", "topic.id", "material.kmis_topic_id")
      .select([
        "material.id",
        "material.kmis_topic_id",
        "material.created_by",
        "material.uploaded_by",
        "material.materials_file_ids",
        "material.materials_cover_ids",
        "material.title",
        "material.material_types",
        "material.material_data",
        "material.description",
        "material.is_public",
        "material.deleted_at",
        "material.created_at",
        "material.updated_at",

        // kolom topik
        "topic.id as topic_id",
        "topic.title as topic_title",
      ]);

    if (!Number.isFinite(roleId) || roleId !== 1) {
      query.where("material.created_by", userId);
    }

    applyTrashedScope(query, req, "material.deleted_at");

    applyRelationIn(query, "material.kmis_topic_id", topicIdAny, {
      as: "number",
    });

    applySearch(query, search, ["material.title", "topic.title"]);

    applyLatestThenTrashed(
      query,
      "material.deleted_at",
      "material.created_at",
      "material.id"
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
      result.data.map((material) => materialResource(material))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data materi berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Material KMIS | - Error function index : ${error.message}`);
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
  const { materialType, title, description, topicId, materialUrl, isPublic } =
    req.body;
  const userId =
    req.auth?.userId ??
    req.auth?.user_id ??
    req.auth?.id ??
    req.userId ??
    req.user?.id;

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

    const type = String(materialType || "").toLowerCase();

    const coverFiles = req.files?.materialCovers || [];
    const materiFiles = req.files?.materialFiles || [];
    const normalizedUrl =
      type === "video" && materialUrl
        ? toYoutubeEmbed(materialUrl)
        : materialUrl;

    const MIME_ALIAS = {
      "application/pdf": "PDF",
      "application/msword": "DOC",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "DOCX",
      "application/vnd.ms-excel": "XLS",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "XLSX",
      "application/vnd.ms-powerpoint": "PPT",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "PPTX",
      "image/jpeg": "JPG/JPEG",
      "image/jpg": "JPG",
      "image/png": "PNG",
    };

    const IMAGE_TYPES = ["image/jpeg", "image/png", "image/jpg"];
    const DOC_TYPES = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
    const MAX_SIZE = 50 * 1024 * 1024;

    const toExtList = (mimes) =>
      [...new Set(mimes.map((m) => MIME_ALIAS[m] || m))].join(", ");

    const checkFiles = (files, allowed, label) => {
      const allowedExts = toExtList(allowed);
      for (const f of files) {
        if (!allowed.includes(f.mimetype)) {
          throw new WithoutDataResource(
            422,
            "INVALID_FILE_TYPE",
            "Tipe File Salah",
            `${label} harus berformat: ${allowedExts}.`
          );
        }
        if (f.size > MAX_SIZE) {
          throw new WithoutDataResource(
            422,
            "FILE_TOO_LARGE",
            "Ukuran File Terlalu Besar",
            `Ukuran maksimal tiap file pada ${label} adalah 50mB.`
          );
        }
      }
      return null;
    };

    // === validasi per tipe ===
    if (type === "gambar") {
      if (materiFiles.length === 0) {
        const r = new WithoutDataResource(
          422,
          "FILES_NOT_FOUND",
          "File Tidak Ditemukan",
          "Berkas materi (materialFiles) wajib diunggah untuk tipe gambar."
        );
        return res.status(422).json(r.toResponse());
      }
      checkFiles(materiFiles, IMAGE_TYPES, "Berkas materi (materialFiles)");
    } else if (type === "dokumen") {
      if (materiFiles.length === 0) {
        const r = new WithoutDataResource(
          422,
          "FILES_NOT_FOUND",
          "File Tidak Ditemukan",
          "Berkas materi (materialFiles) wajib diunggah untuk tipe dokumen."
        );
        return res.status(422).json(r.toResponse());
      }
      checkFiles(materiFiles, DOC_TYPES, "Berkas materi (materialFiles)");
    } else {
      // text / video: tidak wajib file
      // Jika user mengirim file, validasi sewajarnya: cover harus gambar; materiFiles bebas (ikut DOC_TYPES)
      if (materiFiles.length > 0)
        checkFiles(materiFiles, DOC_TYPES, "Berkas materi (materialFiles)");
    }

    const exists = await trx("kmis_materials")
      .whereRaw("lower(title) = lower(?)", [title])
      .where("kmis_topic_id", topicId)
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul materi '${title}' sudah digunakan oleh materi ini. Silakan gunakan judul lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    let uploadedCoverIds = [];
    let uploadedFileIds = [];
    if (coverFiles.length > 0) {
      uploadedCoverIds = await documentHelper.uploadDocuments(coverFiles, req);
    }
    if (materiFiles.length > 0) {
      uploadedFileIds = await documentHelper.uploadDocuments(materiFiles, req);
    }
    const coverFromBody = normIdArray(req.body.materialCovers, {
      as: "number",
    });
    const filesFromBody = normIdArray(req.body.materialFiles, {
      as: "number",
    });
    const coverIds = coverFromBody.length ? coverFromBody : uploadedCoverIds;
    const fileIds = filesFromBody.length ? filesFromBody : uploadedFileIds;

    // const isSuperAdmin = hasAbility(req, "super_admin");
    // const isEducator = hasAbility(req, "educator");
    // const uploadedByBody = Number(req.body?.uploadedBy);

    // let uploadedBy;
    // let notes = "";
    // if (isEducator && !isSuperAdmin) {
    //   uploadedBy = Number(userId);
    //   notes = `Materi diunggah oleh akun pengajar.`;
    // } else {
    //   uploadedBy =
    //     Number.isInteger(uploadedByBody) && uploadedByBody > 0
    //       ? uploadedByBody
    //       : Number(userId);
    //   notes = `Materi diunggah oleh akun super admin yang mengatasnamakan akun pengajar.`;
    // }

    await trx("kmis_materials")
      .insert({
        created_by: userId,
        // uploaded_by: uploadedBy,
        uploaded_by: userId,
        kmis_topic_id: topicId ?? null,
        material_types: type,
        title,
        description,
        material_data: normalizedUrl ?? null,
        materials_file_ids: fileIds?.length ? asJsonb(fileIds) : null,
        materials_cover_ids: coverIds?.length ? asJsonb(coverIds) : null,
        is_public: typeof isPublic === "boolean" ? isPublic : undefined,
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Materi",
        // notes,
      },
      trx
    );

    await trx.commit();

    await syncMaterialOrder();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data materi '${title}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    if (error && typeof error.toResponse === "function") {
      const status = error.status || error.statusCode || 422;
      return res.status(status).json(error.toResponse());
    }

    // Error umum
    logger.error(
      `| Material KMIS | - Error function store: ${
        error?.message || String(error)
      }`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    return res.status(500).json(response.toResponse());
  }
};

exports.show = async (req, res) => {
  const { id } = req.params;

  try {
    const material = await knex("kmis_materials")
      .select("*")
      .where("id", id)
      .first();
    if (!material) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data materi dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await materialResource(material);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data materi '${material.title}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Material KMIS | - Error function show: ${error.message}`);
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
    materialType,
    title,
    description,
    topicId,
    materialUrl,
    isPublic,
    materialCovers,
    materialFiles,
    deleteCoverIds,
    deleteFileIds,
  } = req.body;
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

    const existing = await trx("kmis_materials").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data materi dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const type = String(
      materialType ?? existing.material_types ?? ""
    ).toLowerCase();

    const coverFiles = req.files?.materialCovers || [];
    const materiFiles = req.files?.materialFiles || [];
    const normalizedUrl =
      type === "video" && materialUrl
        ? toYoutubeEmbed(materialUrl)
        : materialUrl;

    const MIME_ALIAS = {
      "application/pdf": "PDF",
      "application/msword": "DOC",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "DOCX",
      "application/vnd.ms-excel": "XLS",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "XLSX",
      "application/vnd.ms-powerpoint": "PPT",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "PPTX",
      "image/jpeg": "JPG/JPEG",
      "image/jpg": "JPG",
      "image/png": "PNG",
      "image/webp": "WEBP",
    };

    const IMAGE_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    const DOC_TYPES = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
    const MAX_SIZE = 50 * 1024 * 1024;

    const toExtList = (mimes) =>
      [...new Set(mimes.map((m) => MIME_ALIAS[m] || m))].join(", ");

    const checkFiles = (files, allowed, label) => {
      const allowedExts = toExtList(allowed);
      for (const f of files) {
        if (!allowed.includes(f.mimetype)) {
          throw new WithoutDataResource(
            422,
            "INVALID_FILE_TYPE",
            "Tipe File Salah",
            `${label} harus berformat: ${allowedExts}.`
          );
        }
        if (f.size > MAX_SIZE) {
          throw new WithoutDataResource(
            422,
            "FILE_TOO_LARGE",
            "Ukuran File Terlalu Besar",
            `Ukuran maksimal tiap file pada ${label} adalah 50mB.`
          );
        }
      }
      return null;
    };

    if (coverFiles.length > 0) {
      const err = checkFiles(
        coverFiles,
        IMAGE_TYPES,
        "File cover (materialCovers)"
      );
      if (err) return res.status(422).json(err.toResponse());
      if (coverFiles.length > 5) {
        return res
          .status(422)
          .json(
            new WithoutDataResource(
              422,
              "MAX_FILES",
              "Terlalu Banyak File",
              "Maksimal upload cover per request adalah 5 file."
            ).toResponse()
          );
      }
    }
    if (materiFiles.length > 0) {
      const allow = type === "gambar" ? IMAGE_TYPES : DOC_TYPES;
      const err = checkFiles(
        materiFiles,
        allow,
        "Berkas materi (materialFiles)"
      );
      if (err) return res.status(422).json(err.toResponse());
    }

    // ===== siapkan list lama =====
    const oldCoverIds = normIdArray(
      normJsonbArray(existing.materials_cover_ids),
      { as: "number" }
    );
    const oldFileIds = normIdArray(
      normJsonbArray(existing.materials_file_ids),
      { as: "number" }
    );

    // ===== hapus sesuai request =====
    const delCover = normIdArray(deleteCoverIds, { as: "number" });
    const delFile = normIdArray(deleteFileIds, { as: "number" });

    let newCoverIds = oldCoverIds.filter((x) => !delCover.includes(x));
    let newFileIds = oldFileIds.filter((x) => !delFile.includes(x));

    // ===== upload baru (append) =====
    let uploadedCoverIds = [];
    let uploadedFileIds = [];
    if (coverFiles.length > 0) {
      uploadedCoverIds = normIdArray(
        await documentHelper.uploadDocuments(coverFiles, req),
        { as: "number" }
      );
    }
    if (materiFiles.length > 0) {
      uploadedFileIds = normIdArray(
        await documentHelper.uploadDocuments(materiFiles, req),
        { as: "number" }
      );
    }

    const addCoverFromBody = normIdArray(materialCovers, { as: "number" });
    const addFileFromBody = normIdArray(materialFiles, { as: "number" });

    const uniq = (arr) => Array.from(new Set(arr.filter((v) => v != null)));

    newCoverIds = uniq([
      ...newCoverIds,
      ...addCoverFromBody,
      ...uploadedCoverIds,
    ]);
    newFileIds = uniq([...newFileIds, ...addFileFromBody, ...uploadedFileIds]);

    if (type === "gambar") {
      if (newFileIds.length === 0) {
        const response = new WithoutDataResource(
          422,
          "FILES_REQUIRED",
          "File Wajib",
          "Untuk tipe 'gambar', minimal harus ada 1 berkas pada materialFiles."
        );
        return res.status(422).json(response.toResponse());
      }
    } else if (type === "dokumen") {
      if (newFileIds.length === 0) {
        const response = new WithoutDataResource(
          422,
          "FILES_REQUIRED",
          "File Wajib",
          "Untuk tipe 'dokumen', minimal harus ada 1 berkas pada materialFiles."
        );
        return res.status(422).json(response.toResponse());
      }
    }

    const duplicate = await trx("kmis_materials")
      .whereRaw("lower(title) = lower(?)", [title])
      .where("kmis_topic_id", topicId)
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul '${title}' sudah digunakan pada materi lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    await trx("kmis_materials")
      .where("id", id)
      .update({
        kmis_topic_id: topicId ?? existing.kmis_topic_id,
        material_types: type || existing.material_types,
        title: title ?? existing.title,
        description: description ?? existing.description,
        material_data: normalizedUrl ?? existing.material_data,
        materials_cover_ids: asJsonb(newCoverIds),
        materials_file_ids: asJsonb(newFileIds),
        is_public:
          typeof isPublic === "boolean" ? isPublic : existing.is_public,
        updated_at: trx.fn.now(),
      });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Materi",
      },
      trx
    );

    await trx.commit();

    await syncMaterialOrder();

    const willDelete = [...delCover, ...delFile].filter((n) =>
      Number.isFinite(n)
    );
    if (willDelete.length) {
      try {
        await documentHelper.deleteDocuments(willDelete);
      } catch (e) {
        logger?.error?.(
          `| Material KMIS | - Gagal hapus dokumen: ${e.message}`
        );
      }
    }

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data materi '${title}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    if (error && typeof error.toResponse === "function") {
      const status = error.status || error.statusCode || 422;
      return res.status(status).json(error.toResponse());
    }

    logger.error(
      `| Material KMIS | - Error function update : ${error.message}`
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

    const existing = await trx("kmis_materials")
      .select("id", "title")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data materi yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("kmis_materials").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Materi",
      },
      trx
    );

    await trx.commit();

    await syncMaterialOrder();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data materi.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Material KMIS | - Error function destroy : ${error.message}`
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

    const softDeleted = await trx("kmis_materials")
      .select("id", "title")
      .whereIn("id", ids)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data materi terhapus yang cocok untuk direstore.`
      );
      return res.status(200).json(response.toResponse());
    }

    // 1) Cek bentrok judul dengan entri aktif
    const titlesLower = softDeleted.map((r) => r.title?.toLowerCase?.() ?? "");
    const activeWithSameTitle = await trx("kmis_materials")
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
      await trx("kmis_materials")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Materi",
      },
      trx
    );

    await trx.commit();

    await syncMaterialOrder();

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
      `Berhasil mengembalikan ${restoredCount} data materi yang terhapus.`,
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
      `| Material KMIS | - Error function restore: ${error.message}`
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

async function syncMaterialOrder() {
  const trx = await knex.transaction();

  try {
    const topics = await trx("kmis_topics")
      .select("id", "material_order_ids")
      .whereNull("deleted_at");

    for (const topic of topics) {
      // 2. Ambil materi yang terkait dengan topicId
      const materials = await trx("kmis_materials")
        .select("id")
        .where("kmis_topic_id", topic.id)
        .whereNull("deleted_at");

      const materialIds = materials.map((material) => Number(material.id));

      await trx("kmis_topics")
        .where("id", topic.id)
        .update({
          material_order_ids: asJsonb(materialIds),
          updated_at: trx.fn.now(),
        });
    }

    const learningAttempts = await trx("kmis_learning_attempts")
      .select("id", "kmis_topic_id", "completed_material_ids")
      .whereNull("deleted_at");

    for (const attempt of learningAttempts) {
      // Ambil materi yang terkait dengan topicId di learning attempt
      const materials = await trx("kmis_materials")
        .select("id")
        .where("kmis_topic_id", attempt.kmis_topic_id)
        .whereNull("deleted_at");

      const materialIds = materials.map((material) => Number(material.id));

      // Ambil completed_material_ids yang ada pada attempt
      const completedIds = normIdArray(attempt.completed_material_ids, {
        as: "number",
      });

      // Filter completed_material_ids untuk menghapus ID yang tidak ada di material_order_ids
      const updatedCompletedIds = completedIds.filter((id) =>
        materialIds.includes(id)
      );

      // Update completed_material_ids pada learning attempt
      await trx("kmis_learning_attempts")
        .where("id", attempt.id)
        .update({
          completed_material_ids: asJsonb(updatedCompletedIds),
          updated_at: trx.fn.now(),
        });
    }

    await trx.commit();
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Material KMIS | - Error function syncMaterialOrder: ${error.message}`
    );
    throw new Error(`Error syncing material order: ${error.message}`);
  }
}
