const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  toArray,
  normJsonbArray,
  normIdArray,
  isPlainObject,
  handleLocalizedText,
} = require("../../helpers/inputNorm");
const { asJsonb } = require("../../helpers/dbJson");
const {
  applyRelationIn,
  applyJsonbSearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const eventResource = require("../../resources/cms/eventResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

exports.index = async (req, res) => {
  const { search, eventCategoryId } = req.query;
  const eventCategoryIdAny = eventCategoryId ?? req.query["eventCategoryId[]"];

  try {
    let query = knex("cms_events as event").select("event.*");

    applyTrashedScope(query, req, "event.deleted_at");

    applyRelationIn(query, "event.cms_event_category_id", eventCategoryIdAny, {
      as: "number",
    });

    applyJsonbSearch(
      query,
      search,
      ["event.title->>'id'", "event.title->>'en'"],
      {
        mode: "or",
        split: true,
      }
    );

    applyLatestThenTrashed(query, "event.deleted_at", "event.created_at");

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
      result.data.map((category) => eventResource(category))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kegiatan berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Event CMS | - Error function index : ${error.message}`);
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
  const { categoryId, title, description, eventContent } = req.body;

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

    const titleNorm = handleLocalizedText(title, {
      allowPartial: false,
      maxLen: 255,
      fieldLabel: "title",
    });
    if (titleNorm.error) {
      const r = new WithoutDataResource(
        422,
        "INVALID_CONTENT_FORMAT",
        "Format Konten Salah",
        titleNorm.error.message
      );
      return res.status(422).json(r.toResponse());
    }

    const descNorm = handleLocalizedText(description, {
      allowPartial: false,
      maxLen: undefined,
      fieldLabel: "description",
    });
    if (descNorm.error) {
      const r = new WithoutDataResource(
        422,
        "INVALID_CONTENT_FORMAT",
        "Format Konten Salah",
        descNorm.error.message
      );
      return res.status(422).json(r.toResponse());
    }

    const contentNorm = handleLocalizedText(eventContent, {
      allowPartial: false,
      maxLen: undefined,
      fieldLabel: "eventContent",
    });
    if (contentNorm.error) {
      const r = new WithoutDataResource(
        422,
        "INVALID_CONTENT_FORMAT",
        "Format Konten Salah",
        contentNorm.error.message
      );
      return res.status(422).json(r.toResponse());
    }

    if (!req.files || req.files.length === 0) {
      const response = new WithoutDataResource(
        422,
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "File thumbnail wajib diunggah."
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

    const exists = await trx("cms_events")
      .whereNull("deleted_at")
      .andWhere(function () {
        this.whereRaw("lower(title->>'id') = lower(?)", [
          titleNorm.value.id,
        ]).orWhereRaw("lower(title->>'en') = lower(?)", [titleNorm.value.en]);
      })
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        "Judul kegiatan (ID/EN) sudah digunakan. Silakan gunakan judul lain."
      );
      return res.status(422).json(response.toResponse());
    }

    const uploadedDocuments = await documentHelper.uploadDocuments(
      req.files,
      req
    );
    const firstId = uploadedDocuments?.[0];
    const thumbnailId = Number(firstId);

    await trx("cms_events")
      .insert({
        cms_event_category_id: categoryId,
        thumbnail_ids: asJsonb([thumbnailId]),
        title: { id: titleNorm.value.id, en: titleNorm.value.en },
        description: { id: descNorm.value.id, en: descNorm.value.en },
        event_content: { id: contentNorm.value.id, en: contentNorm.value.en },
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List Kegiatan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data kegiatan '${titleNorm.value.id}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Event CMS | - Error function store: ${error.message}`);
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
    const event = await knex("cms_events").select("*").where("id", id).first();
    if (!event) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const titleObj = isPlainObject(event.title)
      ? event.title
      : parseJsonSafe(event.title) || {};
    const displayName = titleObj.id || titleObj.en || "Tanpa Nama";

    const data = await eventResource(event);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kegiatan '${displayName}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Event CMS | - Error function show: ${error.message}`);
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
  const { categoryId, title, description, eventContent, deleteDocumentIds } =
    req.body;
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

    const existing = await trx("cms_events").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kegiatan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const exTitle = isPlainObject(existing.title)
      ? existing.title
      : parseJsonSafe(existing.title) ?? { id: "", en: "" };
    const exDesc = isPlainObject(existing.description)
      ? existing.description
      : parseJsonSafe(existing.description) ?? { id: "", en: "" };
    const exContent = isPlainObject(existing.event_content)
      ? existing.event_content
      : parseJsonSafe(existing.event_content) ?? { id: "", en: "" };

    let nextTitle = exTitle;
    if (typeof title !== "undefined") {
      const t = handleLocalizedText(title, {
        allowPartial: true,
        maxLen: 255,
        fieldLabel: "title",
      });
      if (t.error) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          t.error.message
        );
        return res.status(422).json(r.toResponse());
      }
      const merged = { ...exTitle, ...t.value };
      if (
        Object.prototype.hasOwnProperty.call(t.value, "id") &&
        String(t.value.id).trim() === ""
      )
        merged.id = exTitle.id;
      if (
        Object.prototype.hasOwnProperty.call(t.value, "en") &&
        String(t.value.en).trim() === ""
      )
        merged.en = exTitle.en;
      if (!merged.id || !merged.en) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          "Judul harus memiliki id dan en yang tidak kosong."
        );
        return res.status(422).json(r.toResponse());
      }
      nextTitle = {
        id: String(merged.id).trim(),
        en: String(merged.en).trim(),
      };
    }

    let nextDescription = exDesc;
    if (typeof description !== "undefined") {
      const d = handleLocalizedText(description, {
        allowPartial: true,
        maxLen: undefined,
        fieldLabel: "description",
      });
      if (d.error) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          d.error.message
        );
        return res.status(422).json(r.toResponse());
      }
      const merged = { ...exDesc, ...d.value };
      if (
        Object.prototype.hasOwnProperty.call(d.value, "id") &&
        String(d.value.id).trim() === ""
      )
        merged.id = exDesc.id;
      if (
        Object.prototype.hasOwnProperty.call(d.value, "en") &&
        String(d.value.en).trim() === ""
      )
        merged.en = exDesc.en;
      if (!merged.id || !merged.en) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          "Deskripsi harus memiliki id dan en yang tidak kosong."
        );
        return res.status(422).json(r.toResponse());
      }
      nextDescription = {
        id: String(merged.id).trim(),
        en: String(merged.en).trim(),
      };
    }

    let nextContent = exContent;
    if (typeof eventContent !== "undefined") {
      const c = handleLocalizedText(eventContent, {
        allowPartial: true,
        maxLen: undefined,
        fieldLabel: "eventContent",
      });
      if (c.error) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          c.error.message
        );
        return res.status(422).json(r.toResponse());
      }
      const merged = { ...exContent, ...c.value };
      if (
        Object.prototype.hasOwnProperty.call(c.value, "id") &&
        String(c.value.id).trim() === ""
      )
        merged.id = exContent.id;
      if (
        Object.prototype.hasOwnProperty.call(c.value, "en") &&
        String(c.value.en).trim() === ""
      )
        merged.en = exContent.en;
      if (!merged.id || !merged.en) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          "Konten acara harus memiliki id dan en yang tidak kosong."
        );
        return res.status(422).json(r.toResponse());
      }
      nextContent = {
        id: String(merged.id).trim(),
        en: String(merged.en).trim(),
      };
    }

    const titleChanged =
      (nextTitle.id ?? "").toLowerCase() !== (exTitle.id ?? "").toLowerCase() ||
      (nextTitle.en ?? "").toLowerCase() !== (exTitle.en ?? "").toLowerCase();
    if (titleChanged) {
      const duplicate = await trx("cms_events")
        .whereNull("deleted_at")
        .whereNot("id", id)
        .andWhere(function () {
          this.whereRaw("lower(title->>'id') = lower(?)", [
            nextTitle.id,
          ]).orWhereRaw("lower(title->>'en') = lower(?)", [nextTitle.en]);
        })
        .first();
      if (duplicate) {
        const response = new WithoutDataResource(
          422,
          "DUPLICATE_TITLE",
          "Duplikat Data",
          "Judul kegiatan (ID/EN) sudah digunakan pada kegiatan lain."
        );
        return res.status(422).json(response.toResponse());
      }
    }

    const deletedIds = toArray(deleteDocumentIds).map(String);
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const validation = await validateFilesQuotaAndTypesOnUpdate({
      existingRow: existing,
      deleteDocumentIds: deletedIds,
      files: Array.isArray(req.files) ? req.files : [],
      dbColumn: "thumbnail_ids",
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

    const oldCoverIds = normJsonbArray(existing.thumbnail_ids);
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

    await trx("cms_events")
      .where("id", id)
      .update({
        cms_event_category_id: categoryId,
        thumbnail_ids: asJsonb(coverArr),
        title: nextTitle,
        description: nextDescription,
        event_content: nextContent,
        updated_at: trx.fn.now(),
      });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List Kegiatan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data kegiatan '${nextTitle.id}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Event CMS | - Error function update : ${error.message}`);
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

    const existing = await trx("cms_events")
      .select("id", "title")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data kegiatan yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("cms_events").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List Kegiatan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data kegiatan.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Event CMS | - Error function destroy : ${error.message}`);
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

    const softDeleted = await trx("cms_events")
      .select("id", "title")
      .whereIn("id", ids)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Tidak ada data kegiatan terhapus yang cocok untuk direstore."
      );
      return res.status(200).json(response.toResponse());
    }

    // --- Ambil pasangan title.id / title.en dari record terhapus
    const parseName = (v) => {
      const obj = isPlainObject(v) ? v : parseJsonSafe(v) || {};
      const id = typeof obj.id === "string" ? obj.id.trim() : "";
      const en = typeof obj.en === "string" ? obj.en.trim() : "";
      return { id, en, idLower: id.toLowerCase(), enLower: en.toLowerCase() };
    };

    const deletedNames = softDeleted.map((r) => {
      const n = parseName(r.title);
      return { rowId: r.id, ...n };
    });
    const titlesIdLower = deletedNames.map((x) => x.idLower).filter(Boolean);
    const titlesEnLower = deletedNames.map((x) => x.enLower).filter(Boolean);

    // --- Cek bentrok judul dengan entri aktif (dua bahasa)
    let activeWithSameTitle = [];
    if (titlesIdLower.length || titlesEnLower.length) {
      activeWithSameTitle = await trx("cms_events")
        .select("id", "title")
        .whereNull("deleted_at")
        .andWhere(function () {
          let hasCond = false;
          if (titlesIdLower.length) {
            hasCond = true;
            this.whereIn(knex.raw("lower(title->>'id')"), titlesIdLower);
          }
          if (titlesEnLower.length) {
            if (hasCond)
              this.orWhereIn(knex.raw("lower(title->>'en')"), titlesEnLower);
            else this.whereIn(knex.raw("lower(title->>'en')"), titlesEnLower);
          }
        });
    }

    // Kumpulkan semua "label bentrok" aktif (id/en)
    const conflictActive = new Set();
    for (const row of activeWithSameTitle) {
      const n = parseName(row.title);
      if (n.idLower) conflictActive.add(`id:${n.idLower}`);
      if (n.enLower) conflictActive.add(`en:${n.enLower}`);
    }

    // --- Cek duplikat di dalam batch restore sendiri (dua bahasa)
    const seenId = new Set(),
      seenEn = new Set();
    const duplicateInBatch = new Set();
    for (const n of deletedNames) {
      if (n.idLower) {
        if (seenId.has(n.idLower)) duplicateInBatch.add(`id:${n.idLower}`);
        else seenId.add(n.idLower);
      }
      if (n.enLower) {
        if (seenEn.has(n.enLower)) duplicateInBatch.add(`en:${n.enLower}`);
        else seenEn.add(n.enLower);
      }
    }

    // --- Tentukan mana yang boleh direstore
    const restorable = [];
    const skippedConflicts = [];
    const takenId = new Set(); // untuk mencegah duplikat di batch yang sama saat restore
    const takenEn = new Set();

    for (const r of deletedNames) {
      const idKey = r.idLower ? `id:${r.idLower}` : null;
      const enKey = r.enLower ? `en:${r.enLower}` : null;

      const hasActiveConflict =
        (idKey && conflictActive.has(idKey)) ||
        (enKey && conflictActive.has(enKey));
      const hasBatchDup =
        (idKey && duplicateInBatch.has(idKey)) ||
        (enKey && duplicateInBatch.has(enKey));

      // Jika kedua bahasa kosong, kita skip karena tidak bisa verifikasi uniqueness
      const emptyBoth = !r.idLower && !r.enLower;

      if (hasActiveConflict || hasBatchDup || emptyBoth) {
        skippedConflicts.push({
          id: r.id,
          title: { id: r.idLower, en: r.enLower },
        });
        continue;
      }

      // Hindari duplikat antar restorable dalam satu batch
      if (
        (r.idLower && takenId.has(r.idLower)) ||
        (r.enLower && takenEn.has(r.enLower))
      ) {
        skippedConflicts.push({
          id: r.id,
          title: { id: r.idLower, en: r.enLower },
        });
        continue;
      }

      if (r.idLower) takenId.add(r.idLower);
      if (r.enLower) takenEn.add(r.enLower);
      restorable.push(r);
    }

    // --- Eksekusi restore
    let restoredCount = 0;
    if (restorable.length > 0) {
      const idsToRestore = restorable.map((r) => r.rowId);
      await trx("cms_events")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List Kegiatan",
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
    logger.error(`| Event CMS | - Error function restore: ${error.message}`);
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
  dbColumn = "thumbnail_ids",
  maxFilesAllowed = 1,
  allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"],
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

  if (currentCount === 0 && incomingCount === 0) {
    return {
      ok: false,
      http: 422,
      code: "MINIMUM_FILE_REQUIRED",
      title: "Minimal 1 File Harus Ada",
      desc: "Minimal harus ada 1 file di dalam database.",
    };
  }

  // Tidak upload file → boleh lanjut (validator hanya mengembalikan info remaining)
  if (incomingCount === 0) {
    return { ok: true, remaining };
  }

  // Sudah penuh tapi masih ada file yang dikirim
  if (remaining === 0) {
    return {
      ok: false,
      http: 422,
      code: "MAX_CAPACITY",
      title: "Kapasitas Sudah Penuh",
      desc: "Kapasitas file untuk data ini sudah terpenuhi. Tidak ada slot tersisa.",
    };
  }

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
        )}MB.`,
      };
    }
  }

  return { ok: true, remaining };
}
