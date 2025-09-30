const knex = require("../../config/database");
const PDFDocument = require("pdfkit");
const logger = require("../../utils/logger");
const {
  applySearch,
  applyPagination,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const { formatTanggalIndonesia } = require("../../helpers/dateHelper");
const { stripTitlesOnly } = require("../../helpers/credentialHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const quizParticipantResource = require("../../resources/kmis/quizParticipantResource");
// const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");

exports.index = async (req, res) => {
  const { search } = req.query;

  try {
    let query = knex("kmis_quiz_attempts as quizParticipant")
      .leftJoin("users as user", "quizParticipant.attempt_by", "user.id")
      .select(
        "quizParticipant.id",
        "quizParticipant.attempt_by",
        "quizParticipant.attempt_status",
        "quizParticipant.assessment_status",
        "quizParticipant.started_at",
        "quizParticipant.finished_at",
        "quizParticipant.duration",
        "quizParticipant.questions_answered",
        "quizParticipant.correct_count",
        "quizParticipant.wrong_count",
        "quizParticipant.empty_count",
        "quizParticipant.score_total",
        "quizParticipant.deleted_at",
        "quizParticipant.created_at",
        "quizParticipant.updated_at"
      )
      .orderBy("quizParticipant.created_at", "desc");

    // applyTrashedScope(query, req, "quizParticipant.deleted_at");

    applySearch(query, search, ["user.name"]);

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
      result.data.map((quizParticipant) =>
        quizParticipantResource(quizParticipant)
      )
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Data partisipan ujian berhasil diambil.",
      {
        data: serializedData,
        pagination: result.pagination,
      }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Quiz Partisipant KMIS | - Error function index : ${error.message}`
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

// TODO Refactor ini, karena quizcategory sudah tidak ada
// tidak langsung di download, melainkan simpan di tabel kmis_certificates
exports.generateCertificate = async (req, res) => {
  const { id } = req.params;

  try {
    const attempt = await knex("kmis_quiz_attempts as a")
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
        "a.attempt_status",
        "a.score_total",
        "a.started_at",
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
      attempt.attempt_status === 2 || (attempt.score_total ?? 0) > 0;
    if (!eligible) {
      const response = new WithoutDataResource(
        400,
        "NOT_ELIGIBLE",
        "Belum Memenuhi Syarat",
        "Sertifikat hanya dapat dicetak jika attempt sudah selesai atau nilai total sudah tersedia."
      );
      return res.status(400).json(response.toResponse());
    }

    const topicName = attempt.topic_name || "-";
    const userName = stripTitlesOnly(attempt.user_name || "-");
    const totalScoreNum = Number(attempt.score_total ?? 0);
    const totalScoreStr = new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 2,
    }).format(totalScoreNum);

    const startedAtStr = formatTanggalIndonesia(attempt.started_at, 1);

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

// TODO: belum di test, buat controller student untuk create quiz
