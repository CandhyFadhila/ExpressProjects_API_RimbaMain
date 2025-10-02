const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const PDFDocument = require("pdfkit");
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
const { formatTanggalIndonesia } = require("../../helpers/dateHelper");
const { stripTitlesOnly } = require("../../helpers/credentialHelper");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const categoryResource = require("../../resources/kmis/categoryResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");

// create kmis_learning_attempts

// update kmis_learning_attempts
// 1. update completed_course

// create kmis_quiz_responses when student submit quiz

// update kmis_quiz_responses when student finish quiz
// 1. calculate score
// 2. update completed_quiz
// 3. update

// generate certificate, store files, and update certificate_ids in kmis_learning_attempts

exports.storeQuizAttempt = async (req, res) => {
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
        422,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
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

    const exists = await trx("kmis_categories")
      .whereRaw("lower(title) = lower(?)", [title])
      .whereNull("deleted_at")
      .first();
    if (exists) {
      const response = new WithoutDataResource(
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul kategori '${title}' sudah digunakan. Silakan gunakan judul lain.`
      );
      return res.status(422).json(response.toResponse());
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

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Kategori",
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
        422,
        "FAILED_VALIDATION",
        "Format Data Tidak Sesuai Ketentuan",
        message
      );
      return res.status(422).json(response.toResponse());
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
        422,
        "DUPLICATE_TITLE",
        "Duplikat Data",
        `Judul '${title}' sudah digunakan pada kategori lain.`
      );
      return res.status(422).json(response.toResponse());
    }

    const deletedIds = toArray(deleteDocumentIds).map(String);
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const validation = await validateFilesQuotaAndTypesOnUpdate({
      existingRow: existing,
      deleteDocumentIds: deletedIds,
      files: Array.isArray(req.files) ? req.files : [],
      dbColumn: "category_cover_ids",
      maxFilesAllowed: 1,
      allowedTypes,
      sizeLimitBytes: 10 * 1024 * 1024,
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

    const oldCoverIds = normJsonbArray(existing.category_cover_ids);
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

    await trx("kmis_categories")
      .where("id", id)
      .update({
        category_cover_ids: asJsonb(coverArr),
        title,
        description,
        updated_at: trx.fn.now(),
      });

    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "List Kategori",
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

exports.generateCertificate = async (req, res) => {
  const { id } = req.params;

  try {
    const attempt = await knex("kmis_learning_attempts as a")
      .leftJoin("users as u", "u.id", "a.attempt_by")
      .leftJoin(
        "kmis_quiz_categories as qc",
        "qc.id",
        "a.kmis_quiz_categories_id"
      )
      .leftJoin("kmis_topics as t", "t.id", "qc.kmis_topic_id")
      .where("a.id", id)
      .whereNull("a.deleted_at")
      .whereNull("qc.deleted_at")
      .whereNull("t.deleted_at")
      .select([
        "a.id",
        "a.attempt_by",
        "a.quiz_attempt_status",
        "a.score_total",
        "a.quiz_started",
        knex.raw("COALESCE(u.name, '') as user_name"),
        knex.raw("COALESCE(t.title, '') as topic_name"),
      ])
      .first();
    if (!attempt) {
      const response = new WithoutDataResource(
        404,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data quiz attempt dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(404).json(response.toResponse());
    }

    const eligible =
      attempt.quiz_attempt_status === 2 || (attempt.score_total ?? 0) > 0;
    if (!eligible) {
      const response = new WithoutDataResource(
        422,
        "NOT_ELIGIBLE",
        "Belum Memenuhi Syarat",
        "Sertifikat hanya dapat dicetak jika attempt sudah selesai atau nilai total sudah tersedia."
      );
      return res.status(422).json(response.toResponse());
    }

    const topicName = attempt.topic_name || "-";
    const userName = stripTitlesOnly(attempt.user_name || "-");
    const totalScoreNum = Number(attempt.score_total ?? 0);
    const totalScoreStr = new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 2,
    }).format(totalScoreNum);

    const startedAtStr = formatTanggalIndonesia(attempt.quiz_started, 1);

    // Header response untuk stream PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="certificate-${attempt.id}.pdf"`
    );

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 50,
      info: {
        Title: `Certificate Attempt #${attempt.id}`,
        Author: "Rimba",
        Subject: "Quiz Completion Certificate",
      },
    });

    doc.pipe(res);

    // Border
    doc
      .lineWidth(2)
      .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
      .stroke();

    // Watermark halus
    doc.save();
    doc.opacity(0.06);
    doc
      .fontSize(180)
      .font("Helvetica-Bold")
      .text("KMIS", 0, doc.page.height / 3 - 90, { align: "center" });
    doc.restore();

    // Judul
    doc.moveDown(1.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .text("SERTIFIKAT KELULUSAN KUIS", { align: "center" });
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(14)
      .text("Diberikan kepada:", { align: "center" });

    // Nama peserta
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(24).text(userName, { align: "center" });

    // Garis tipis
    doc.moveDown(0.6);
    const centerX = doc.page.width / 2;
    doc
      .moveTo(centerX - 150, doc.y)
      .lineTo(centerX + 150, doc.y)
      .stroke();

    // Detail sertifikat
    doc.moveDown(1.2);
    doc
      .font("Helvetica")
      .fontSize(14)
      .text(`Topik: ${topicName}`, { align: "center" });
    doc.moveDown(0.2);
    doc.text(`Nilai Akhir: ${totalScoreStr}`, { align: "center" });
    doc.moveDown(0.2);
    doc.text(`Mulai Mengerjakan: ${startedAtStr}`, { align: "center" });

    // Footer info cetak
    const printedAtStr = formatTanggalIndonesia(new Date().toISOString(), 1);
    doc.moveDown(2);
    doc
      .fontSize(12)
      .text(`Dicetak pada: ${printedAtStr}`, 50, doc.page.height - 90, {
        width: doc.page.width - 100,
        align: "right",
      });

    doc.end();

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: `Sertifikat Ujian #${attempt.id} ${userName}`,
      },
      trx
    );
  } catch (error) {
    logger.error(
      `| Quiz Partisipant KMIS | - Error function createCertificate : ${error.message}`
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
