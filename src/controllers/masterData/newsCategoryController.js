const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const {
  isPlainObject,
  normIdArray,
  handleLocalizedText,
} = require("../../helpers/inputNorm");
const {
  applyJsonbSearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const newsCategoryResource = require("../../resources/masterData/newsCategoryResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("cms_news_categories as category").select("category.*");

    applyTrashedScope(query, req, "category.deleted_at");

    applyJsonbSearch(
      query,
      search,
      [
        "category.name->>'id'",
        "category.name->>'en'",
        "category.description->>'id'",
        "category.description->>'en'",
      ],
      {
        mode: "or",
        split: true,
      }
    );

    applyLatestThenTrashed(query, "category.deleted_at", "category.created_at", "category.id");

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
      result.data.map((category) => newsCategoryResource(category))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data kategori berita berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| News Category Master | - Error function index : ${error.message}`
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

    const nameNorm = handleLocalizedText(name, {
      allowPartial: false,
      maxLen: 255,
      fieldLabel: "name",
    });
    if (nameNorm.error) {
      const r = new WithoutDataResource(
        422,
        "INVALID_CONTENT_FORMAT",
        "Format Konten Salah",
        nameNorm.error.message
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

    const exists = await trx("cms_news_categories")
      .whereNull("deleted_at")
      .andWhere(function () {
        this.whereRaw("lower(name->>'id') = lower(?)", [
          nameNorm.value.id,
        ]).orWhereRaw("lower(name->>'en') = lower(?)", [nameNorm.value.en]);
      })
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        "Nama kategori berita ini sudah digunakan pada kategori lain."
      );
      return res.status(422).json(response.toResponse());
    }

    await trx("cms_news_categories").insert({
      name: { id: nameNorm.value.id, en: nameNorm.value.en },
      description: { id: descNorm.value.id, en: descNorm.value.en },
    });

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "List Kategori Berita",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data kategori berita '${nameNorm.value.id}' berhasil ditambahkan.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| News Category Master | - Error function store: ${error.message}`
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
    const category = await knex("cms_news_categories")
      .select("*")
      .where("id", id)
      .first();
    if (!category) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori berita dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await newsCategoryResource(category);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data kategori berita '${category.name}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| News Category Master | - Error function show: ${error.message}`
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
  const { name, description } = req.body;
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

    const existing = await trx("cms_news_categories").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kategori berita dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const exName = isPlainObject(existing.name)
      ? existing.name
      : parseJsonSafe(existing.name) ?? { id: "", en: "" };

    const exDesc = isPlainObject(existing.description)
      ? existing.description
      : parseJsonSafe(existing.description) ?? { id: "", en: "" };

    let nextName = exName;
    if (typeof name !== "undefined") {
      const norm = handleLocalizedText(name, {
        allowPartial: true,
        maxLen: 255,
        fieldLabel: "nama",
      });
      if (norm.error) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          norm.error.message
        );
        return res.status(422).json(r.toResponse());
      }
      const n = { ...exName, ...norm.value };
      // abaikan string kosong yang dikirim
      if (
        Object.prototype.hasOwnProperty.call(norm.value, "id") &&
        String(norm.value.id).trim() === ""
      )
        n.id = exName.id;
      if (
        Object.prototype.hasOwnProperty.call(norm.value, "en") &&
        String(norm.value.en).trim() === ""
      )
        n.en = exName.en;

      // pastikan id & en akhir tidak kosong
      if (!n.id || !n.en) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          "Nama harus memiliki id dan en yang tidak kosong."
        );
        return res.status(422).json(r.toResponse());
      }
      nextName = { id: String(n.id).trim(), en: String(n.en).trim() };
    }

    let nextDescription = exDesc;
    if (typeof description !== "undefined") {
      const norm = handleLocalizedText(description, {
        allowPartial: true,
        maxLen: undefined, // deskripsi bebas
        fieldLabel: "deskripsi",
      });
      if (norm.error) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          norm.error.message
        );
        return res.status(422).json(r.toResponse());
      }
      const d = { ...exDesc, ...norm.value };
      if (
        Object.prototype.hasOwnProperty.call(norm.value, "id") &&
        String(norm.value.id).trim() === ""
      )
        d.id = exDesc.id;
      if (
        Object.prototype.hasOwnProperty.call(norm.value, "en") &&
        String(norm.value.en).trim() === ""
      )
        d.en = exDesc.en;

      if (!d.id || !d.en) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          "Deskripsi harus memiliki id dan en yang tidak kosong."
        );
        return res.status(422).json(r.toResponse());
      }
      nextDescription = { id: String(d.id).trim(), en: String(d.en).trim() };
    }

    const nameChanged =
      (nextName.id ?? "").toLowerCase() !== (exName.id ?? "").toLowerCase() ||
      (nextName.en ?? "").toLowerCase() !== (exName.en ?? "").toLowerCase();

    if (nameChanged) {
      const duplicate = await trx("cms_news_categories")
        .whereNull("deleted_at")
        .whereNot("id", id)
        .andWhere(function () {
          this.whereRaw("lower(name->>'id') = lower(?)", [
            nextName.id,
          ]).orWhereRaw("lower(name->>'en') = lower(?)", [nextName.en]);
        })
        .first();
      if (duplicate) {
        const response = new WithoutDataResource(
          422,
          "DUPLICATE_TITLE",
          "Duplikat Data",
          "Nama kategori berita (ID/EN) sudah digunakan pada kategori lain."
        );
        return res.status(422).json(response.toResponse());
      }
    }

    await trx("cms_news_categories").where("id", id).update({
      name: nextName,
      description: nextDescription,
      updated_at: trx.fn.now(),
    });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "List Kategori Berita",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data kategori berita '${nextName.id}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| News Category Master | - Error function update : ${error.message}`
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

    const existing = await trx("cms_news_categories")
      .select("id", "name")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data kategori berita yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("cms_news_categories").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "List Kategori Berita",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data kategori berita.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| News Category Master | - Error function destroy : ${error.message}`
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

    const softDeleted = await trx("cms_news_categories")
      .select("id", "name")
      .whereIn("id", ids)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        "Tidak ada data kategori satwa terhapus yang cocok untuk direstore."
      );
      return res.status(200).json(response.toResponse());
    }

    // --- Ambil pasangan name.id / name.en dari record terhapus
    const parseName = (v) => {
      const obj = isPlainObject(v) ? v : parseJsonSafe(v) || {};
      const id = typeof obj.id === "string" ? obj.id.trim() : "";
      const en = typeof obj.en === "string" ? obj.en.trim() : "";
      return { id, en, idLower: id.toLowerCase(), enLower: en.toLowerCase() };
    };

    const deletedNames = softDeleted.map((r) => {
      const n = parseName(r.name);
      return { rowId: r.id, ...n };
    });
    const namesIdLower = deletedNames.map((x) => x.idLower).filter(Boolean);
    const namesEnLower = deletedNames.map((x) => x.enLower).filter(Boolean);

    // --- Cek bentrok judul dengan entri aktif (dua bahasa)
    let activeWithSameTitle = [];
    if (namesIdLower.length || namesEnLower.length) {
      activeWithSameTitle = await trx("cms_news_categories")
        .select("id", "name")
        .whereNull("deleted_at")
        .andWhere(function () {
          let hasCond = false;
          if (namesIdLower.length) {
            hasCond = true;
            this.whereIn(knex.raw("lower(name->>'id')"), namesIdLower);
          }
          if (namesEnLower.length) {
            if (hasCond)
              this.orWhereIn(knex.raw("lower(name->>'en')"), namesEnLower);
            else this.whereIn(knex.raw("lower(name->>'en')"), namesEnLower);
          }
        });
    }

    // Kumpulkan semua "label bentrok" aktif (id/en)
    const conflictActive = new Set();
    for (const row of activeWithSameTitle) {
      const n = parseName(row.name);
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
          name: { id: r.idLower, en: r.enLower },
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
          name: { id: r.idLower, en: r.enLower },
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
      await trx("cms_news_categories")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "master_data",
        subject: "List Kategori Berita",
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
      `| News Category Master | - Error function restore: ${error.message}`
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
