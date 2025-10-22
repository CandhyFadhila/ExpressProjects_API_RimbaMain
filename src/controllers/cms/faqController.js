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
const faqResource = require("../../resources/cms/faqResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("cms_faqs as faq").select("faq.*");

    applyTrashedScope(query, req, "faq.deleted_at");

    applyJsonbSearch(
      query,
      search,
      [
        "faq.question->>'id'",
        "faq.question->>'en'",
        "faq.answer->>'id'",
        "faq.answer->>'en'",
      ],
      {
        mode: "or",
        split: true,
      }
    );

    applyLatestThenTrashed(query, "faq.deleted_at", "faq.created_at", "faq.id");

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
      result.data.map((faq) => faqResource(faq))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data FAQ berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| FAQ CMS | - Error function index : ${error.message}`
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
  const { question, answer } = req.body;

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

    const questionNorm = handleLocalizedText(question, {
      allowPartial: false,
      maxLen: 255,
      fieldLabel: "question",
    });
    if (questionNorm.error) {
      const r = new WithoutDataResource(
        422,
        "INVALID_CONTENT_FORMAT",
        "Format Konten Salah",
        questionNorm.error.message
      );
      return res.status(422).json(r.toResponse());
    }

    const answerNorm = handleLocalizedText(answer, {
      allowPartial: false,
      maxLen: undefined,
      fieldLabel: "answer",
    });
    if (answerNorm.error) {
      const r = new WithoutDataResource(
        422,
        "INVALID_CONTENT_FORMAT",
        "Format Konten Salah",
        answerNorm.error.message
      );
      return res.status(422).json(r.toResponse());
    }

    const exists = await trx("cms_faqs")
      .whereNull("deleted_at")
      .andWhere(function () {
        this.whereRaw("lower(question->>'id') = lower(?)", [
          questionNorm.value.id,
        ]).orWhereRaw("lower(question->>'en') = lower(?)", [questionNorm.value.en]);
      })
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_QUESTION",
        "Duplikat Data",
        "Pertanyaan FAQ (ID/EN) sudah digunakan, silakan gunakan pertanyaan lain."
      );
      return res.status(422).json(response.toResponse());
    }

    await trx("cms_faqs").insert({
      question: { id: questionNorm.value.id, en: questionNorm.value.en },
      answer: { id: answerNorm.value.id, en: answerNorm.value.en },
    });

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List FAQ",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      "Data FAQ berhasil ditambahkan."
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| FAQ CMS | - Error function store: ${error.message}`
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
    const faq = await knex("cms_faqs")
      .select("*")
      .where("id", id)
      .first();
    if (!faq) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data FAQ dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await faqResource(faq);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data FAQ berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| FAQ CMS | - Error function show: ${error.message}`
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
  const { question, answer } = req.body;
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

    const existing = await trx("cms_faqs").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data FAQ dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const exQuestion = isPlainObject(existing.question)
      ? existing.question
      : parseJsonSafe(existing.question) ?? { id: "", en: "" };

    const exAnswer = isPlainObject(existing.answer)
      ? existing.answer
      : parseJsonSafe(existing.answer) ?? { id: "", en: "" };

    let nextQuestion = exQuestion;
    if (typeof question !== "undefined") {
      const norm = handleLocalizedText(question, {
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
      const n = { ...exQuestion, ...norm.value };
      // abaikan string kosong yang dikirim
      if (
        Object.prototype.hasOwnProperty.call(norm.value, "id") &&
        String(norm.value.id).trim() === ""
      )
        n.id = exQuestion.id;
      if (
        Object.prototype.hasOwnProperty.call(norm.value, "en") &&
        String(norm.value.en).trim() === ""
      )
        n.en = exQuestion.en;

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
      nextQuestion = { id: String(n.id).trim(), en: String(n.en).trim() };
    }

    let nextAnswer = exAnswer;
    if (typeof answer !== "undefined") {
      const norm = handleLocalizedText(answer, {
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
      const d = { ...exAnswer, ...norm.value };
      if (
        Object.prototype.hasOwnProperty.call(norm.value, "id") &&
        String(norm.value.id).trim() === ""
      )
        d.id = exAnswer.id;
      if (
        Object.prototype.hasOwnProperty.call(norm.value, "en") &&
        String(norm.value.en).trim() === ""
      )
        d.en = exAnswer.en;

      if (!d.id || !d.en) {
        const r = new WithoutDataResource(
          422,
          "INVALID_CONTENT_FORMAT",
          "Format Konten Salah",
          "Deskripsi harus memiliki id dan en yang tidak kosong."
        );
        return res.status(422).json(r.toResponse());
      }
      nextAnswer = { id: String(d.id).trim(), en: String(d.en).trim() };
    }

    const questionChanged =
      (nextQuestion.id ?? "").toLowerCase() !== (exQuestion.id ?? "").toLowerCase() ||
      (nextQuestion.en ?? "").toLowerCase() !== (exQuestion.en ?? "").toLowerCase();

    if (questionChanged) {
      const duplicate = await trx("cms_faqs")
        .whereNull("deleted_at")
        .whereNot("id", id)
        .andWhere(function () {
          this.whereRaw("lower(question->>'id') = lower(?)", [
            nextQuestion.id,
          ]).orWhereRaw("lower(question->>'en') = lower(?)", [nextQuestion.en]);
        })
        .first();
      if (duplicate) {
        const response = new WithoutDataResource(
          422,
          "DUPLICATE_QUESTION",
          "Duplikat Data",
          "Pertanyaan FAQ (ID/EN) sudah digunakan pada data lain."
        );
        return res.status(422).json(response.toResponse());
      }
    }

    await trx("cms_faqs").where("id", id).update({
      question: nextQuestion,
      answer: nextAnswer,
      updated_at: trx.fn.now(),
    });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List FAQ",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Data FAQ '${nextQuestion.id}' berhasil diperbarui.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| FAQ CMS | - Error function update : ${error.message}`
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

    const existing = await trx("cms_faqs")
      .select("id", "question")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data kategori satwa yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("cms_faqs").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List FAQ",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data kategori satwa.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| FAQ CMS | - Error function destroy : ${error.message}`
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

    const softDeleted = await trx("cms_faqs")
      .select("id", "question")
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

    // --- Ambil pasangan question.id / question.en dari record terhapus
    const parseName = (v) => {
      const obj = isPlainObject(v) ? v : parseJsonSafe(v) || {};
      const id = typeof obj.id === "string" ? obj.id.trim() : "";
      const en = typeof obj.en === "string" ? obj.en.trim() : "";
      return { id, en, idLower: id.toLowerCase(), enLower: en.toLowerCase() };
    };

    const deletedNames = softDeleted.map((r) => {
      const n = parseName(r.question);
      return { rowId: r.id, ...n };
    });
    const questionsIdLower = deletedNames.map((x) => x.idLower).filter(Boolean);
    const questionsEnLower = deletedNames.map((x) => x.enLower).filter(Boolean);

    // --- Cek bentrok judul dengan entri aktif (dua bahasa)
    let activeWithSameTitle = [];
    if (questionsIdLower.length || questionsEnLower.length) {
      activeWithSameTitle = await trx("cms_faqs")
        .select("id", "question")
        .whereNull("deleted_at")
        .andWhere(function () {
          let hasCond = false;
          if (questionsIdLower.length) {
            hasCond = true;
            this.whereIn(knex.raw("lower(question->>'id')"), questionsIdLower);
          }
          if (questionsEnLower.length) {
            if (hasCond)
              this.orWhereIn(knex.raw("lower(question->>'en')"), questionsEnLower);
            else this.whereIn(knex.raw("lower(question->>'en')"), questionsEnLower);
          }
        });
    }

    // Kumpulkan semua "label bentrok" aktif (id/en)
    const conflictActive = new Set();
    for (const row of activeWithSameTitle) {
      const n = parseName(row.question);
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
          question: { id: r.idLower, en: r.enLower },
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
          question: { id: r.idLower, en: r.enLower },
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
      await trx("cms_faqs")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "cms",
        subject: "List FAQ",
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
      `| FAQ CMS | - Error function restore: ${error.message}`
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
