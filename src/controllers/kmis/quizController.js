const { validationResult } = require("express-validator");
const XLSX = require("xlsx");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { normIdArray } = require("../../helpers/inputNorm");
const {
  applyRelationIn,
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const {
  storeQuizValidator,
} = require("../../validators/kmis/storeQuizValidator");
const quizResource = require("../../resources/kmis/quizResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyLatestThenTrashed } = require("../../helpers/queryOrderHelper");
const normalizeAnswer = (v) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();

exports.index = async (req, res) => {
  const { search, topicId } = req.query;

  try {
    let query = knex("kmis_quiz as quiz").select("quiz.*");

    applyRelationIn(query, "quiz.kmis_topic_id", topicId, {
      as: "number",
    });

    applySearch(query, search, ["quiz.question"]);

    applyLatestThenTrashed(query, "quiz.deleted_at", "quiz.created_at");

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
      result.data.map((quiz) => quizResource(quiz))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data soal pertanyaan berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Quiz KMIS | - Error function index : ${error.message}`);
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
    topicId,
    question,
    answerA,
    answerB,
    answerC,
    answerD,
    correctOption,
    explanation,
  } = req.body;

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

    const exists = await trx("kmis_quiz")
      .whereRaw("lower(question) = lower(?)", [question])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_QUESTION",
        "Duplikat Data",
        "Ada soal pertanyaan yang sama dengan yang anda buat. Silakan buat soal yang lain."
      );
      return res.status(422).json(response.toResponse());
    }

    {
      const pairs = [
        ["A", answerA],
        ["B", answerB],
        ["C", answerC],
        ["D", answerD],
      ];
      const seen = new Map(); // norm -> label
      for (const [label, text] of pairs) {
        const norm = normalizeAnswer(text);
        if (seen.has(norm)) {
          const dupWith = seen.get(norm);
          const response = new WithoutDataResource(
            422,
            "DUPLICATE_ANSWERS",
            "Duplikat Opsi Jawaban",
            `Jawaban pilihan ${label} sama dengan pilihan ${dupWith}. Setiap opsi A sampai D harus unik.`
          );
          return res.status(422).json(response.toResponse());
        }
        seen.set(norm, label);
      }
    }

    await validateTopicTotalQuizQuota([{ topicId }], trx);

    const normalizedExplanation =
      explanation === undefined ||
      explanation === null ||
      (typeof explanation === "string" && explanation.trim() === "")
        ? null
        : typeof explanation === "string"
        ? explanation.trim()
        : explanation;

    await trx("kmis_quiz")
      .insert({
        kmis_topic_id: topicId,
        question,
        answer_a: answerA,
        answer_b: answerB,
        answer_c: answerC,
        answer_d: answerD,
        correct_option: correctOption,
        explanation: normalizedExplanation,
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Soal Pertanyaan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      "Data soal pertanyaan baru berhasil ditambahkan."
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();

    if (error.code === "OVER_QUOTA") {
      const response = new WithoutDataResource(
        422,
        "OVER_QUOTA",
        "Melebihi Batas Kuota Soal",
        error.message
      );
      return res.status(422).json(response.toResponse());
    }
    logger.error(`| Quiz KMIS | - Error function store: ${error.message}`);
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
    const quiz = await knex("kmis_quiz").select("*").where("id", id).first();
    if (!quiz) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data soal pertanyaan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const data = await quizResource(quiz);
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Detail data soal pertanyaan berhasil didapatkan.",
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(`| Quiz KMIS | - Error function show: ${error.message}`);
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
    topicId,
    question,
    answerA,
    answerB,
    answerC,
    answerD,
    correctOption,
    explanation,
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

    const existing = await trx("kmis_quiz").where("id", id).first();
    if (!existing) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data soal pertanyaan dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const duplicate = await trx("kmis_quiz")
      .whereRaw("lower(question) = lower(?)", [question])
      .whereNull("deleted_at")
      .whereNot("id", id)
      .first();
    if (duplicate) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_QUESTION",
        "Duplikat Data",
        "Ada soal pertanyaan yang sama dengan yang anda perbarui. Silakan buat soal yang lain."
      );
      return res.status(422).json(response.toResponse());
    }

    {
      const pairs = [
        ["A", answerA],
        ["B", answerB],
        ["C", answerC],
        ["D", answerD],
      ];
      const seen = new Map(); // norm -> label
      for (const [label, text] of pairs) {
        const norm = normalizeAnswer(text);
        if (seen.has(norm)) {
          const dupWith = seen.get(norm);
          const response = new WithoutDataResource(
            422,
            "DUPLICATE_ANSWERS",
            "Duplikat Opsi Jawaban",
            `Jawaban pilihan ${label} sama dengan pilihan ${dupWith}. Setiap opsi A sampai D harus unik.`
          );
          return res.status(422).json(response.toResponse());
        }
        seen.set(norm, label);
      }
    }

    await trx("kmis_quiz")
      .where("id", id)
      .update({
        kmis_topic_id: topicId ?? existing.kmis_topic_id,
        question: question ?? existing.question,
        answer_a: answerA ?? existing.answer_a,
        answer_b: answerB ?? existing.answer_b,
        answer_c: answerC ?? existing.answer_c,
        answer_d: answerD ?? existing.answer_d,
        correct_option: correctOption ?? existing.correct_option,
        explanation: explanation ? existing.explanation : null,
        updated_at: trx.fn.now(),
      });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Soal Pertanyaan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      "Data soal pertanyaan berhasil diperbarui."
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Quiz KMIS | - Error function update : ${error.message}`);
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

    const existing = await trx("kmis_quiz")
      .select("id", "question")
      .whereIn("id", ids)
      .whereNull("deleted_at");
    if (existing.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data soal pertanyaan yang cocok atau sudah terhapus.`
      );
      return res.status(200).json(response.toResponse());
    }

    const existingIds = existing.map((r) => r.id);

    await trx("kmis_quiz").whereIn("id", existingIds).update({
      deleted_at: trx.fn.now(),
    });

    await activityLogHelper.logDelete(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Soal Pertanyaan",
      },
      trx
    );

    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_DELETE_DATA",
      "Berhasil Menghapus Data",
      `Berhasil menghapus (soft delete) ${existingIds.length} data soal pertanyaan.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(`| Quiz KMIS | - Error function destroy : ${error.message}`);
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

    const softDeleted = await trx("kmis_quiz")
      .select("id", "question")
      .whereIn("id", ids)
      .whereNotNull("deleted_at");
    if (softDeleted.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada data soal pertanyaan terhapus yang cocok untuk direstore.`
      );
      return res.status(200).json(response.toResponse());
    }

    // 1) Cek bentrok judul dengan entri aktif
    const questionsLower = softDeleted.map(
      (r) => r.question?.toLowerCase?.() ?? ""
    );
    const activeWithSameTitle = await trx("kmis_quiz")
      .select(knex.raw("lower(question) AS lquestion"))
      .whereNull("deleted_at")
      .whereIn(knex.raw("lower(question)"), questionsLower);

    const conflictActive = new Set(activeWithSameTitle.map((r) => r.lquestion));

    // 2) Cek duplikat judul di dalam batch restore sendiri
    const seenBatch = new Set();
    const duplicateInBatch = new Set();
    for (const r of softDeleted) {
      const lt = (r.question || "").toLowerCase();
      if (seenBatch.has(lt)) duplicateInBatch.add(lt);
      else seenBatch.add(lt);
    }

    // 3) Tentukan mana yang boleh direstore (tidak bentrok & bukan duplikat batch)
    const restorable = [];
    const skippedConflicts = [];
    const takenInBatch = new Set(); // untuk hanya ambil satu per question di batch

    for (const r of softDeleted) {
      const lt = (r.question || "").toLowerCase();
      const hasActiveConflict = conflictActive.has(lt);
      const hasBatchDup = duplicateInBatch.has(lt);
      if (hasActiveConflict || hasBatchDup) {
        skippedConflicts.push({ id: r.id, question: r.question });
        continue;
      }
      if (takenInBatch.has(lt)) {
        // safety: kalau ada urutan ganda, skip
        skippedConflicts.push({ id: r.id, question: r.question });
        continue;
      }
      takenInBatch.add(lt);
      restorable.push(r);
    }

    // 4) Eksekusi restore
    let restoredCount = 0;
    if (restorable.length > 0) {
      const idsToRestore = restorable.map((r) => r.id);
      await trx("kmis_quiz")
        .whereIn("id", idsToRestore)
        .update({ deleted_at: null, updated_at: trx.fn.now() });
      restoredCount = idsToRestore.length;
    }

    await activityLogHelper.logRestore(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Soal Pertanyaan",
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
    logger.error(`| Quiz KMIS | - Error function restore: ${error.message}`);
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

exports.downloadTemplate = async (req, res) => {
  try {
    // 1) Ambil data referensi terbaru (hanya id & name)
    const [topics, categories] = await Promise.all([
      knex("kmis_topics as t")
        .join("kmis_categories as c", "c.id", "t.kmis_categories_id")
        .whereNull("t.deleted_at")
        .whereNull("c.deleted_at")
        .select({
          id: "t.id",
          topicName: "t.title",
          topicDescription: "t.description",
          totalQuiz: "t.total_quiz",
          categoryId: "c.id",
          categoryName: "c.title",
        })
        .orderBy("t.id", "asc"),
      knex("kmis_categories as c")
        .whereNull("c.deleted_at")
        .select({
          id: "c.id",
          name: "c.title",
          description: "c.description",
        })
        .orderBy("c.id", "asc"),
    ]);

    // 2) Sheet 1: Template input quiz
    const header = [
      "topicId",
      "question",
      "answerA",
      "answerB",
      "answerC",
      "answerD",
      "correctOption",
      "explanation",
    ];

    // baris ke-2 berisi petunjuk singkat (explanation boleh kosong)
    const sheet1Data = [
      header,
      [
        "(number)",
        "(text)",
        "(text)",
        "(text)",
        "(text)",
        "(text)",
        "A/B/C/D",
        "(optional)",
      ],
    ];

    const wsTemplate = XLSX.utils.aoa_to_sheet(sheet1Data);
    wsTemplate["!cols"] = [
      { wch: 15 }, // topicId
      { wch: 120 }, // question
      { wch: 25 }, // answerA
      { wch: 25 }, // answerB
      { wch: 25 }, // answerC
      { wch: 25 }, // answerD
      { wch: 20 }, // correctOption
      { wch: 120 }, // explanation
    ];

    // 3) Sheet 2: Referensi
    const topicsTable = [
      [
        "TOPICS (pakai kolom 'id' untuk diisi ke 'topicId' pada sheet Template)",
      ],
      ["id", "categoryName", "topicName", "description", "totalQuiz"],
      ...topics.map((t) => [
        t.id,
        t.categoryName,
        t.topicName,
        t.topicDescription,
        t.totalQuiz ?? "", // bisa null -> kosong
      ]),
    ];

    const wsRef = XLSX.utils.aoa_to_sheet(topicsTable);

    wsRef["!cols"] = [
      { wch: 8 }, // id
      { wch: 40 }, // categoryName
      { wch: 40 }, // topicName
      { wch: 40 }, // description
      { wch: 12 }, // totalQuiz
    ];

    // 4) Buat workbook & kirim sebagai .xls
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsTemplate, "Template");
    XLSX.utils.book_append_sheet(wb, wsRef, "Referensi");

    const buffer = XLSX.write(wb, { bookType: "biff8", type: "buffer" });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="quiz_template.xls"'
    );
    res.setHeader("Content-Type", "application/vnd.ms-excel");
    return res.status(200).send(buffer);
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Quiz KMIS | - Error function downloadTemplate : ${error.message}`
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

exports.importTemplate = async (req, res) => {
  const trx = await knex.transaction();

  try {
    if (!req.files || req.files.length === 0) {
      const response = new WithoutDataResource(
        422,
        "FILES_NOT_FOUND",
        "File Tidak Ditemukan",
        "File soal pertanyaan wajib diunggah."
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

    const file = req.files[0];
    const allowedMimes = new Set([
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    ]);
    if (!allowedMimes.has(file.mimetype)) {
      const response = new WithoutDataResource(
        422,
        "INVALID_FILE_TYPE",
        "Tipe File Tidak Didukung",
        "Format file harus .xls atau .xlsx."
      );
      return res.status(422).json(response.toResponse());
    }

    // --- 1) Parse Excel & ambil Sheet 1 (Template)
    let wb;
    try {
      wb = XLSX.read(file.buffer, { type: "buffer" });
    } catch (e) {
      const response = new WithoutDataResource(
        422,
        "BAD_EXCEL",
        "File Excel Tidak Valid",
        "File Excel rusak atau tidak dapat dibaca."
      );
      return res.status(422).json(response.toResponse());
    }

    const sheetName =
      wb.SheetNames.find((n) => n.toLowerCase() === "template") ||
      wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      const response = new WithoutDataResource(
        422,
        "SHEET_NOT_FOUND",
        "Sheet Tidak Ditemukan",
        'Sheet "Template" tidak ditemukan pada file yang diunggah.'
      );
      return res.status(422).json(response.toResponse());
    }

    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1, // AOA
      defval: null, // kosong -> null
      blankrows: false,
    });
    if (!rows.length) {
      const response = new WithoutDataResource(
        422,
        "EMPTY_SHEET",
        "Sheet Kosong",
        "Sheet Template tidak berisi data."
      );
      return res.status(422).json(response.toResponse());
    }

    // --- 2) Validasi header
    const rawHeader = rows[0].map((x) =>
      String(x ?? "")
        .trim()
        .toLowerCase()
    );
    const expected = [
      "topicid",
      "question",
      "answera",
      "answerb",
      "answerc",
      "answerd",
      "correctoption",
      "explanation",
    ];
    if (rawHeader.join("|") !== expected.join("|")) {
      const response = new WithoutDataResource(
        422,
        "HEADER_MISMATCH",
        "Format Header Tidak Sesuai",
        "Header pada sheet Template tidak sesuai dengan format terbaru."
      );
      return res.status(422).json(response.toResponse());
    }

    // --- 3) Siapkan helper parsing
    const toStr = (v) =>
      v === null || v === undefined ? "" : String(v).trim();
    const toIntOrNaN = (v) => {
      if (v === null || v === undefined || v === "") return NaN;
      const n = Number(v);
      return Number.isInteger(n) ? n : NaN;
    };

    const HINT_MARKERS = new Set([
      "(number)",
      "(text)",
      "A/B/C/D",
      "(optional)",
    ]);
    const isHintRow = (row) =>
      Array.isArray(row) &&
      row.some((c) => typeof c === "string" && HINT_MARKERS.has(c.trim()));

    const startIndex = isHintRow(rows[1]) ? 2 : 1; // kalau ada petunjuk, data mulai baris 3
    const excelStartRow = startIndex + 1;

    const dataRows = rows.slice(startIndex);
    const items = [];
    const perRowErrors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i] || [];
      const isEmpty = r.every((c) => c === null || c === "");
      if (isEmpty) continue;

      const excelRowNum = excelStartRow + i; // baris excel (1-based)

      const obj = {
        topicId: toIntOrNaN(r[0]),
        question: toStr(r[1]),
        answerA: toStr(r[2]),
        answerB: toStr(r[3]),
        answerC: toStr(r[4]),
        answerD: toStr(r[5]),
        correctOption: toStr(r[6]).toUpperCase(),
        explanation: (() => {
          const s = toStr(r[7]);
          return s === "" ? null : s;
        })(),
      };

      // --- 4) Jalankan validator cek jawaban unik dan route secara programatik per baris
      {
        const pairs = [
          ["A", obj.answerA],
          ["B", obj.answerB],
          ["C", obj.answerC],
          ["D", obj.answerD],
        ];
        const seen = new Map();
        let dupWithMsg = null;

        for (const [label, text] of pairs) {
          const norm = normalizeAnswer(text);
          if (seen.has(norm)) {
            const dupWith = seen.get(norm);
            dupWithMsg = `Baris ${excelRowNum}: Jawaban pilihan ${label} sama dengan pilihan ${dupWith}. Setiap opsi A sampai D harus unik.`;
            break;
          }
          seen.set(norm, label);
        }

        if (dupWithMsg) {
          perRowErrors.push(dupWithMsg);
          continue;
        }
      }

      const fakeReq = { body: obj };
      await Promise.all(storeQuizValidator.map((v) => v.run(fakeReq)));
      const result = validationResult(fakeReq);
      if (!result.isEmpty()) {
        perRowErrors.push(
          `Baris ${excelRowNum}: ${result
            .array()
            .map((e) => e.msg)
            .join(" ")}`
        );
        continue;
      }

      items.push({ excelRowNum, ...obj });
    }

    if (!items.length) {
      const response = new WithoutDataResource(
        422,
        "NO_VALID_ROWS",
        "Tidak Ada Data Valid",
        perRowErrors.length
          ? perRowErrors.join(" ")
          : "Tidak ada baris data yang dapat diproses."
      );
      return res.status(422).json(response.toResponse());
    }

    // --- 5) Cek duplikat pertanyaan dalam batch (case-insensitive)
    const seen = new Map(); // qLower -> firstRowNum
    for (const it of items) {
      const qLower = it.question.toLowerCase();
      if (seen.has(qLower)) {
        const firstRow = seen.get(qLower);
        perRowErrors.push(
          `Baris ${it.excelRowNum}: Duplikat pertanyaan dengan baris ${firstRow}.`
        );
      } else {
        seen.set(qLower, it.excelRowNum);
      }
    }
    if (perRowErrors.length) {
      const response = new WithoutDataResource(
        422,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        perRowErrors.join(" ")
      );
      return res.status(422).json(response.toResponse());
    }

    // --- 6) Validasi keberadaan topicId
    const topicIds = [...new Set(items.map((x) => x.topicId))];
    const topicsExist = await trx("kmis_topics as t")
      .leftJoin("kmis_categories as c", "c.id", "t.kmis_categories_id")
      .whereIn("t.id", topicIds)
      .whereNull("t.deleted_at")
      .whereNull("c.deleted_at")
      .select("t.id");

    const topicIdSet = new Set(topicsExist.map((r) => Number(r.id)));
    for (const it of items) {
      if (!topicIdSet.has(it.topicId)) {
        perRowErrors.push(
          `Baris ${it.excelRowNum}: topicId (${it.topicId}) tidak valid / tidak ditemukan.`
        );
      }
    }
    if (perRowErrors.length) {
      const response = new WithoutDataResource(
        422,
        "INVALID_RELATION",
        "Relasi Tidak Valid",
        perRowErrors.join(" ")
      );
      return res.status(422).json(response.toResponse());
    }

    // --- 7) Cek duplikat pertanyaan di DB (case-insensitive)
    const uniqueQLower = [...seen.keys()];
    const dupDb = await trx("kmis_quiz")
      .select("question")
      .whereNull("deleted_at")
      .whereIn(trx.raw("lower(question)"), uniqueQLower);
    if (dupDb.length) {
      const dupSet = new Set(dupDb.map((d) => d.question.toLowerCase()));
      for (const it of items) {
        if (dupSet.has(it.question.toLowerCase())) {
          perRowErrors.push(
            `Baris ${it.excelRowNum}: Soal pertanyaan sudah ada di database. Silakan buat soal yang lain.`
          );
        }
      }
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_QUESTION",
        "Duplikat Pada Database",
        perRowErrors.join(" ")
      );
      return res.status(422).json(response.toResponse());
    }

    // --- 8) VALIDASI KUOTA total_question
    try {
      await validateTopicTotalQuizQuota(
        items.map((it) => ({
          topicId: it.topicId,
          excelRowNum: it.excelRowNum,
        })),
        trx
      );
    } catch (e) {
      await trx.rollback();
      const response = new WithoutDataResource(
        e.statusCode || 422,
        e.code || "OVER_QUOTA",
        "Melebihi Batas Kuota Soal",
        e.message || "Jumlah soal pada file melebihi kuota yang diperbolehkan."
      );
      return res.status(422).json(response.toResponse());
    }

    // --- 9) Insert batch dalam transaksi
    try {
      const toInsert = items.map((it) => ({
        kmis_topic_id: it.topicId,
        question: it.question,
        answer_a: it.answerA,
        answer_b: it.answerB,
        answer_c: it.answerC,
        answer_d: it.answerD,
        correct_option: it.correctOption,
        explanation: it.explanation,
      }));

      await trx("kmis_quiz").insert(toInsert);

      await activityLogHelper.logCreate(
        {
          userId: activityLogHelper.fromReq(req),
          module: "kmis",
          subject: `Import Soal Pertanyaan (${toInsert.length})`,
        },
        trx
      );

      await trx.commit();

      const response = new WithoutDataResource(
        201,
        "SUCCESS_IMPORT",
        "Berhasil Mengimpor Data",
        `Berhasil mengimpor ${toInsert.length} soal pertanyaan.`
      );
      return res.status(201).json(response.toResponse());
    } catch (e) {
      const response = new WithoutDataResource(
        500,
        "SERVER_ERROR",
        "Server Sedang Error",
        "Gagal menyimpan data ke database."
      );
      logger.error(
        `| Quiz KMIS | - Error function importTemplate (DB): ${e.message}`
      );
      return res.status(500).json(response.toResponse());
    }
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Quiz KMIS | - Error function importTemplate : ${error.message}`
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

async function validateTopicTotalQuizQuota(items, trx) {
  const group = new Map(); // qcId -> { countInFile, rows[] }
  for (const it of items) {
    const topicId = Number(it.topicId);
    if (!group.has(topicId)) group.set(topicId, { countInFile: 0, rows: [] });
    const g = group.get(topicId);
    g.countInFile += 1;
    if (it.excelRowNum) g.rows.push(it.excelRowNum);
  }
  const topicIds = [...group.keys()];
  if (topicIds.length === 0) return;

  const topicRows = await trx("kmis_topics")
    .whereIn("id", topicIds)
    .whereNull("deleted_at")
    .select("id", "total_quiz")
    .forUpdate();

  const totalMap = new Map(
    topicRows.map((r) => [
      Number(r.id),
      r.total_quiz === null ? null : Number(r.total_quiz),
    ])
  );

  const existingRows = await trx("kmis_quiz")
    .whereIn("kmis_topic_id", topicIds)
    .whereNull("deleted_at")
    .select("kmis_topic_id")
    .count({ n: "*" })
    .groupBy("kmis_topic_id");

  const existMap = new Map(
    existingRows.map((r) => [Number(r.kmis_topic_id), Number(r.n)])
  );

  const errors = [];
  for (const [topicId, { countInFile, rows }] of group.entries()) {
    const total = totalMap.get(topicId);
    if (total === undefined) {
      errors.push(`topicId ${topicId} tidak ditemukan / nonaktif.`);
      continue;
    }
    if (total === null) {
      // unlimited → tidak dibatasi
      continue;
    }
    const existing = existMap.get(topicId) ?? 0;
    const remaining = total - existing;

    if (remaining < 0) {
      errors.push(
        `Kuota topik ${topicId} sudah melebihi batas (existing ${existing} > total ${total}).`
      );
      continue;
    }
    if (countInFile > remaining) {
      errors.push(
        rows?.length
          ? `Topik ID ${topicId}: sisa kuota quiz ${remaining}, namun file template mencoba menambahkan ${countInFile} item (baris: ${rows.join(
              ", "
            )}).`
          : `Topik ID ${topicId}: sisa kuota quiz ${remaining}, namun file template mencoba menambahkan ${countInFile} item.`
      );
    }
  }

  if (errors.length) {
    const err = new Error(errors.join(" "));
    err.statusCode = 422;
    err.code = "OVER_QUOTA";
    throw err;
  }
}
