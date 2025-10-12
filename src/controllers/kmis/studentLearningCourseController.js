const { validationResult } = require("express-validator");
const knex = require("../../config/database");
const logger = require("../../utils/logger");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const { asJsonb } = require("../../helpers/dbJson");
const renderEmailTemplate = require("../../utils/emailOTP/renderEmailTemplate");
const {
  applySearch,
  applyPagination,
  applyRelationIn,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const dateHelper = require("../../helpers/dateHelper");
const { stripTitlesOnly } = require("../../helpers/credentialHelper");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");
const documentHelper = require("../../helpers/documentHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const activityLogHelper = require("../../helpers/activityLogHelper");
const learningParticipantResource = require("../../resources/kmis/learningParticipantResource");
const UserResource = require("../../resources/auth/UserResource");
const topicResource = require("../../resources/kmis/topicResource");
const quizResource = require("../../resources/kmis/quizResource");
const materialResource = require("../../resources/kmis/materialResource");
const QUIZ_STATUS = Object.freeze({ STARTED: 1, FINISHED: 2, ABANDONED: 3 });

exports.getListLearningAttempt = async (req, res) => {
  const { search, categoryId } = req.query;
  const userId =
    req.auth?.userId ??
    req.auth?.user_id ??
    req.auth?.id ??
    req.userId ??
    req.user?.id;

  try {
    let query = knex("kmis_learning_attempts as quizParticipant")
      .leftJoin("users as user", "quizParticipant.attempt_by", "user.id")
      .leftJoin(
        "kmis_topics as topic",
        "quizParticipant.kmis_topic_id",
        "topic.id"
      )
      .select("quizParticipant.*")
      .where("quizParticipant.attempt_by", userId);

    applyTrashedScope(query, req, "quizParticipant.deleted_at");

    applyRelationIn(query, "topic.kmis_categories_id", categoryId, {
      as: "number",
    });

    applySearch(query, search, ["user.name", "topic.title"]);

    query.orderByRaw(`
      CASE "quizParticipant"."quiz_attempt_status"
        WHEN 2 THEN 0
        WHEN 1 THEN 1
        WHEN 3 THEN 2
        ELSE 3
      END ASC,
      "quizParticipant"."created_at" DESC
    `);

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
      result.data.map((quizParticipant) =>
        learningParticipantResource(quizParticipant)
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
      `| Learning Attempt KMIS | - Error function getListLearningAttempt : ${error.message}`
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

exports.getDetailLearningAttemptbyTopicId = async (req, res) => {
  const { id } = req.params;

  try {
    const topic = await knex("kmis_topics")
      .select("*")
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!topic) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data topik dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const [materials, materialCountRow, feedbackData, avgRow] =
      await Promise.all([
        knex("kmis_materials")
          .select(["id", "title", "material_types"])
          .where("kmis_topic_id", id)
          .whereNull("deleted_at")
          .orderBy("created_at", "asc"),

        knex("kmis_materials")
          .where("kmis_topic_id", id)
          .whereNull("deleted_at")
          .count("* as total")
          .first(),

        // Feedback list (unik per attempt_by)
        knex("kmis_learning_attempts")
          .select(["attempt_by", "feedback", "feedback_comment"])
          .where("kmis_topic_id", id)
          .where("quiz_attempt_status", QUIZ_STATUS.FINISHED)
          .whereNull("deleted_at")
          .distinct("attempt_by")
          .limit(5),

        // AVG feedback (hanya yang FINISHED & feedback tidak null)
        knex("kmis_learning_attempts")
          .where("kmis_topic_id", id)
          .where("quiz_attempt_status", QUIZ_STATUS.FINISHED)
          .whereNotNull("feedback")
          .whereNull("deleted_at")
          .avg({ avg: "feedback" })
          .first(),
      ]);

    const totalMaterial = Number(materialCountRow?.total || 0);

    const feedback = await Promise.all(
      feedbackData.map(async (row) => {
        const ratedByUser = await knex("users")
          .select("*")
          .where("id", row.attempt_by)
          .first();
        return {
          ratedBy: ratedByUser ? await UserResource(ratedByUser) : null,
          rate: row.feedback ?? null,
          comment: row.feedback_comment ?? null,
        };
      })
    );

    // Convert AVG ke number JS (misal "3.5000" -> 3.5). Jika tidak ada data, null.
    const avgFeedbackRate =
      avgRow && avgRow.avg != null ? Number(avgRow.avg) : null;

    const data = {
      topic: await topicResource(topic),
      material: materials.map((m) => ({
        id: m.id,
        title: m.title,
        materialType: m.material_types,
      })),
      totalMaterial,
      feedback,
      avgFeedbackRate, // <— tambah di response
    };

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail data topik '${topic.title}' berhasil didapatkan.`,
      data
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Learning Attempt KMIS | - Error function getDetailLearningAttemptbyTopicId : ${error.message}`
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

exports.getOrderMaterialLearningAttemptbyTopicId = async (req, res) => {
  const { id } = req.params;
  const userId =
    req.auth?.userId ??
    req.auth?.user_id ??
    req.auth?.id ??
    req.userId ??
    req.user?.id;

  try {
    const learningAttempt = await knex("kmis_learning_attempts")
      .select("*")
      .where("kmis_topic_id", id)
      .where("attempt_by", userId)
      .first();
    if (!learningAttempt) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Pembelajaran dengan topik ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const topic = await knex("kmis_topics")
      .select("id", "material_order_ids")
      .where("id", learningAttempt.kmis_topic_id)
      .first();
    if (!topic || !topic.material_order_ids) {
      const response = new WithoutDataResource(
        422,
        "TOPIC_INVALID",
        "Topik Tidak Valid",
        "Tidak ada urutan materi yang tersedia pada topik ini."
      );
      return res.status(422).json(response.toResponse());
    }

    const materialOrderIds = topic.material_order_ids;
    const materials = await knex("kmis_materials")
      .select("*")
      .whereIn("id", materialOrderIds)
      .whereNull("deleted_at")
      .orderByRaw(`array_position(?, id)`, [materialOrderIds]);
    const completedMaterialIds = learningAttempt.completed_material_ids || [];

    const materialWithStatus = await Promise.all(
      materials.map(async (material) => {
        const materialDetails = await materialResource(material);
        const isCompleted = completedMaterialIds.includes(Number(material.id));
        return {
          ...materialDetails,
          isCompleted,
        };
      })
    );

    const learningParticipantData = await learningParticipantResource(
      learningAttempt
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Detail materi berdasarkan urutan berhasil didapatkan.`,
      { material: materialWithStatus, learningAttempt: learningParticipantData }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Learning Attempt KMIS | - Error function getOrderMaterialLearningAttemptbyTopicId : ${error.message}`
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

exports.storeLearningAttempt = async (req, res) => {
  const trx = await knex.transaction();
  const { topicId } = req.body;
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

    const topic = await knex("kmis_topics")
      .where("id", topicId)
      .whereNull("deleted_at")
      .first();
    if (!topic) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data topik dengan ID '${topicId}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const [materialsAgg, quizAgg] = await Promise.all([
      trx("kmis_materials")
        .where("kmis_topic_id", topicId)
        .whereNull("deleted_at")
        .count("* as total")
        .first(),
      trx("kmis_quiz")
        .where("kmis_topic_id", topicId)
        .whereNull("deleted_at")
        .count("* as total")
        .first(),
    ]);

    const totalMaterial = Number(materialsAgg?.total ?? 0);
    const totalQuiz = Number(quizAgg?.total ?? 0);

    // if (totalMaterial < 1 || totalQuiz < 1) {
    //   await trx.rollback();
    //   const response = new WithoutDataResource(
    //     422,
    //     "FAILED_VALIDATION",
    //     "Topik Belum Siap Dipelajari",
    //     `Topik '${topicId}' membutuhkan minimal 1 materi dan 1 soal kuis. Saat ini: ${totalMaterial} materi dan ${totalQuiz} kuis.`
    //   );
    //   return res.status(422).json(response.toResponse());
    // }

    const already = await trx("kmis_learning_attempts")
      .where({ attempt_by: userId, kmis_topic_id: topicId })
      .whereNull("deleted_at")
      .first();
    if (already) {
      await trx.rollback();
      const response = new WithoutDataResource(
        409,
        "ALREADY_EXISTS",
        "Attempt Sudah Ada",
        `Kamu sudah mempelajari topik pembelajaran saat ini, Silahkan lanjutkan ke topik lainnya.`
      );
      return res.status(409).json(response.toResponse());
    }

    const startedAtDb = dateHelper.toUTC(new Date().toISOString());

    await trx("kmis_learning_attempts")
      .insert({
        attempt_by: userId,
        kmis_topic_id: topicId,
        quiz_attempt_status: 1,
        quiz_assessment_status: false,
        total_material: totalMaterial,
        learning_started: startedAtDb,
      })
      .returning("*");

    await activityLogHelper.logCreate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "Pembelajaran Materi & Quiz",
      },
      trx
    );

    await trx.commit();

    const topicTitle = topic?.title ?? "Topik Pembelajaran";
    const response = new WithoutDataResource(
      201,
      "SUCCESS_CREATE_DATA",
      "Berhasil Menyimpan Data",
      `Data pembelajaran materi & quiz berhasil ditambahkan untuk topik pembelajaran '${topicTitle}'.`
    );
    return res.status(201).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Learning Attempt KMIS | - Error function storeLearningAttempt: ${error.message}`
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

exports.updateProgressLearningAttempt = async (req, res) => {
  const trx = await knex.transaction();
  const id = req.params.id;

  try {
    // Ambil data learning attempt berdasarkan id
    const learningAttempt = await trx("kmis_learning_attempts")
      .where("id", id)
      .whereNull("deleted_at")
      .forUpdate()
      .first();
    if (!learningAttempt) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data pembelajaran dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    // Ambil material_order_ids dari kmis_topics
    const topic = await trx("kmis_topics")
      .where("id", learningAttempt.kmis_topic_id)
      .whereNull("deleted_at")
      .first();
    const materialOrderIds = topic?.material_order_ids; // Ambil urutan materi pada topik
    if (!materialOrderIds || materialOrderIds.length === 0) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "TOPIC_INVALID",
        "Topik Tidak Valid",
        "Tidak ada materi yang tersedia dalam topik ini."
      );
      return res.status(422).json(response.toResponse());
    }

    // Cek jika progress sudah selesai
    if (
      learningAttempt.completed_material_ids.length === materialOrderIds.length
    ) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "LEARNING_ALREADY_COMPLETED",
        "Pembelajaran Sudah Selesai",
        "Anda sudah menyelesaikan semua materi dalam topik ini. Silahkan lanjutkan mengerjakan kuis dan dapatkan sertifikatnya!."
      );
      return res.status(200).json(response.toResponse());
    }

    // 1. Validasi materi pertama pada material_order_ids
    if (learningAttempt.completed_material_ids.length > 0) {
      const firstCompletedMaterial = learningAttempt.completed_material_ids[0];
      if (firstCompletedMaterial !== materialOrderIds[0]) {
        // Jika materi pertama bukan yang sesuai urutan, kembalikan response
        await trx.rollback();
        const response = new WithoutDataResource(
          422,
          "INVALID_MATERIAL_ORDER",
          "Urutan Materi Tidak Sesuai",
          "Anda harus menyelesaikan materi pertama terlebih dahulu."
        );
        return res.status(422).json(response.toResponse());
      }
    }

    // 2. Validasi jenis materi dan waktu
    const materialIdToCheck =
      materialOrderIds[learningAttempt.completed_material_ids.length];
    const material = await trx("kmis_materials")
      .where("id", materialIdToCheck)
      .whereNull("deleted_at")
      .first();
    if (!material) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "MATERIAL_NOT_FOUND",
        "Materi Tidak Ditemukan",
        "Materi untuk validasi tidak ditemukan."
      );
      return res.status(422).json(response.toResponse());
    }

    // Validasi jenis materi
    const materialTypes = {
      text: 5 * 60,
      video: 30 * 60,
      dokumen: 10 * 60,
      gambar: 5 * 60,
    };
    const requiredDuration = materialTypes[material.material_types];
    if (!requiredDuration) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "MATERIAL_TYPE_INVALID",
        "Tipe Materi Tidak Valid",
        `Jenis materi ${material.material_types} tidak dikenali untuk validasi durasi.`
      );
      return res.status(422).json(response.toResponse());
    }

    {
      const hasAnyProgress =
        Array.isArray(learningAttempt.completed_material_ids) &&
        learningAttempt.completed_material_ids.length > 0;

      const baselineTs = hasAnyProgress
        ? learningAttempt.updated_at
        : learningAttempt.learning_started;

      const baselineUTC = dateHelper.toUTC(baselineTs);
      const nowUTC = dateHelper.toUTC(new Date());

      // Jika baseline belum tersedia, anggap baru mulai belajar
      const elapsedSec =
        baselineUTC && nowUTC ? Math.max(0, (nowUTC - baselineUTC) / 1000) : 0;

      if (elapsedSec < requiredDuration) {
        const remainSec = Math.ceil(requiredDuration - elapsedSec);
        const remainMin = Math.ceil(remainSec / 60);
        await trx.rollback();
        const response = new WithoutDataResource(
          422,
          "TIME_NOT_ELAPSED",
          "Waktu Belajar Belum Cukup",
          `Untuk materi bertipe '${
            material.material_types
          }', minimal belajar ${Math.round(
            requiredDuration / 60
          )} menit. Sisa waktu kira-kira ${remainMin} menit lagi.`
        );
        return res.status(422).json(response.toResponse());
      }
    }

    // 3. Update completed_material_ids
    const completedMaterialIds = [
      ...learningAttempt.completed_material_ids,
      materialIdToCheck,
    ];

    // Cek jika completed_material_ids melebihi total materi
    if (completedMaterialIds.length > materialOrderIds.length) {
      await trx.rollback();
      const response = new WithoutDataResource(
        422,
        "INVALID_PROGRESS",
        "Progress Tidak Valid",
        "Jumlah materi yang diselesaikan melebihi jumlah materi yang ada."
      );
      return res.status(422).json(response.toResponse());
    }

    const validCompletedMaterialIds = asJsonb(completedMaterialIds);
    await trx("kmis_learning_attempts").where("id", id).update({
      completed_material_ids: validCompletedMaterialIds,
      updated_at: trx.fn.now(),
    });

    // 4. Log aktivitas
    await activityLogHelper.logUpdate(
      {
        userId: activityLogHelper.fromReq(req),
        module: "kmis",
        subject: "Pembelajaran Materi & Quiz",
      },
      trx
    );

    // Commit transaksi
    await trx.commit();

    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Berhasil Memperbarui",
      `Progress materi berhasil diperbarui menjadi ${completedMaterialIds.length}/${materialOrderIds.length}.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Learning Attempt KMIS | - Error function updateProgressLearningAttempt: ${error.message}`
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

exports.getAllQuizbyTopicId = async (req, res) => {
  const { id } = req.params;

  try {
    const topic = await knex("kmis_topics")
      .where("id", id)
      .select("id", "title")
      .first();
    if (!topic) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data topik dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const quizzes = await knex("kmis_quiz")
      .where("kmis_topic_id", topic.id)
      .whereNull("deleted_at")
      .select([
        "id",
        "kmis_topic_id",
        "question",
        "answer_a",
        "answer_b",
        "answer_c",
        "answer_d",
        "created_at",
        "updated_at",
      ])
      .orderBy("id", "asc");
    if (!quizzes || quizzes.length === 0) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data kuis untuk topik '${topic.title}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const serializedData = await Promise.all(
      quizzes.map((quiz) => quizResource(quiz))
    );

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      `Daftar kuis untuk topik '${topic.title}' berhasil didapatkan.`,
      { quiz: serializedData }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Learning Attempt KMIS | - Error function getAllQuizbyTopicId : ${error.message}`
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

exports.storeQuizAttempt = async (req, res) => {
  const trx = await knex.transaction();
  const { learningAttemptId, quizId } = req.body;
  const selectedOption = String(req.body.selectedOption || "")
    .trim()
    .toUpperCase();
  const isMarker = !!req.body.isMarker;

  const userId =
    req.auth?.userId ??
    req.auth?.user_id ??
    req.auth?.id ??
    req.userId ??
    req.user?.id;

  try {
    // Validasi progress belajar
    const isProgressValid = await validateLearningProgress(learningAttemptId);
    if (!isProgressValid) {
      const response = new WithoutDataResource(
        422,
        "LEARNING_PROGRESS_INCOMPLETE",
        "Progress Belajar Belum Tercapai",
        "Anda belum menyelesaikan seluruh materi pada topik ini. Silahkan selesaikan materi terlebih dahulu."
      );
      return res.status(422).json(response.toResponse());
    }

    // Validasi durasi
    const isValidTime = await validateQuizDuration(learningAttemptId);
    if (!isValidTime) {
      // Jika waktu sudah habis, langsung panggil submitAllAttempt
      return exports.submitAllAttempt(req, res);
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

    try {
      // Ambil attempt & kunci baris
      const attempt = await trx("kmis_learning_attempts")
        .where("id", learningAttemptId)
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!attempt) {
        await trx.rollback();
        const response = new WithoutDataResource(
          200,
          "DATA_NOT_FOUND",
          "Data Tidak Ditemukan",
          `Pembelajaran dengan ID '${learningAttemptId}' tidak ditemukan.`
        );
        return res.status(200).json(response.toResponse());
      }

      // Kepemilikan
      const attemptByBig = BigInt(String(attempt.attempt_by));
      const userIdBig = BigInt(String(userId));
      if (attemptByBig !== userIdBig) {
        await trx.rollback();
        const response = new WithoutDataResource(
          403,
          "FORBIDDEN_QUIZ_ACCESS",
          "Akses Ditolak",
          "Anda tidak berhak mengisi jawaban untuk kuis yang bukan milik anda."
        );
        return res.status(403).json(response.toResponse());
      }

      // Cegah jawaban untuk attempt yang sudah selesai/abandoned
      if (
        [QUIZ_STATUS.FINISHED, QUIZ_STATUS.ABANDONED].includes(
          Number(attempt.quiz_attempt_status)
        )
      ) {
        await trx.rollback();
        const response = new WithoutDataResource(
          409,
          "ATTEMPT_CLOSED",
          "Attempt Tidak Aktif",
          "Kuis sudah selesai/ditutup, tidak dapat menambahkan jawaban."
        );
        return res.status(409).json(response.toResponse());
      }

      // Ambil quiz & cek konsistensi topik
      const quiz = await trx("kmis_quiz")
        .where("id", quizId)
        .whereNull("deleted_at")
        .first();
      if (!quiz) {
        await trx.rollback();
        const response = new WithoutDataResource(
          200,
          "DATA_NOT_FOUND",
          "Data Tidak Ditemukan",
          `Kuis dengan ID '${quizId}' tidak ditemukan.`
        );
        return res.status(200).json(response.toResponse());
      }
      if (Number(quiz.kmis_topic_id) !== Number(attempt.kmis_topic_id)) {
        await trx.rollback();
        const response = new WithoutDataResource(
          422,
          "FAILED_VALIDATION",
          "Kuis Tidak Sesuai Topik",
          "Kuis tidak termasuk dalam topik pembelajaran ini."
        );
        return res.status(422).json(response.toResponse());
      }

      // Hitung total soal & answered aktif
      const [{ total: totalQuizStr }] = await trx("kmis_quiz")
        .where("kmis_topic_id", attempt.kmis_topic_id)
        .whereNull("deleted_at")
        .count("* as total");
      const totalQuiz = Number(totalQuizStr || 0);

      const [{ total: answeredActiveBeforeStr }] = await trx(
        "kmis_quiz_responses"
      )
        .where("kmis_learning_attempt_id", learningAttemptId)
        .whereNull("deleted_at")
        .count("* as total");
      const answeredActiveBefore = Number(answeredActiveBeforeStr || 0);

      // Cek apakah ini REVISI (sudah ada jawaban aktif untuk pasangan attempt+quiz)
      const existingActive = await trx("kmis_quiz_responses")
        .where({
          kmis_learning_attempt_id: learningAttemptId,
          kmis_quiz_id: quizId,
        })
        .whereNull("deleted_at")
        .first();

      const isRevision = !!existingActive;

      // Soft-delete jawaban lama (jika ada), lalu INSERT jawaban baru
      if (isRevision) {
        await trx("kmis_quiz_responses").where("id", existingActive.id).update({
          deleted_at: trx.fn.now(),
        });
      }

      const answeredAtDb = dateHelper.toUTC(new Date().toISOString());
      const isCorrect =
        selectedOption === String(quiz.correct_option || "").toUpperCase();

      await trx("kmis_quiz_responses")
        .insert({
          kmis_learning_attempt_id: learningAttemptId,
          kmis_quiz_id: quizId,
          selected_option: selectedOption,
          is_marker: isMarker,
          is_correct: isCorrect,
          answered_at: answeredAtDb,
        })
        .returning("*");

      await trx("kmis_learning_attempts")
        .where("id", learningAttemptId)
        .update({
          quiz_started: trx.raw(
            "COALESCE(quiz_started, ?::timestamp without time zone)",
            [answeredAtDb]
          ),
          updated_at: trx.fn.now(),
        });

      const answeredAfter = answeredActiveBefore + (isRevision ? 0 : 1);
      await activityLogHelper.logCreate(
        {
          userId: activityLogHelper.fromReq(req),
          module: "kmis",
          subject: "Pembelajaran Materi & Quiz",
          description: isRevision
            ? `Revisi jawaban: topicId=${attempt.kmis_topic_id}, quizId=${quizId}, selected=${selectedOption}, correct=${isCorrect}, progress=${answeredAfter}/${totalQuiz}`
            : `Menyimpan jawaban: quizId=${quizId}, selected=${selectedOption}, correct=${isCorrect}, progress=${answeredAfter}/${totalQuiz}`,
        },
        trx
      );

      await trx.commit();

      const dataPayload = await attemptExamResponse(learningAttemptId);

      const response = new WithDataResource(
        201,
        isRevision ? "SUCCESS_REVISED_ANSWER" : "SUCCESS_ANSWERED_QUESTION",
        "Berhasil Menyimpan Data",
        isRevision
          ? `Revisi jawaban pada soal ${quizId} tersimpan (${answeredAfter}/${totalQuiz}).`
          : `Jawaban berhasil tersimpan (${answeredAfter}/${totalQuiz}).`,
        dataPayload
      );
      return res.status(201).json(response.toResponse());
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Quiz Attempt KMIS | - Error function storeQuizAttempt: ${error.message}`
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

exports.submitAllAttempt = async (req, res) => {
  const trx = await knex.transaction();
  const { learningAttemptId } = req.body;
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

    let attempt;
    let summary;
    let certFile;
    try {
      // Ambil attempt & kunci baris
      attempt = await trx("kmis_learning_attempts")
        .where("id", learningAttemptId)
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!attempt) {
        await trx.rollback();
        const response = new WithoutDataResource(
          200,
          "DATA_NOT_FOUND",
          "Data Tidak Ditemukan",
          `Pembelajaran dengan ID '${learningAttemptId}' tidak ditemukan.`
        );
        return res.status(200).json(response.toResponse());
      }

      // Kepemilikan
      const attemptByBig = BigInt(String(attempt.attempt_by));
      const userIdBig = BigInt(String(userId));
      if (attemptByBig !== userIdBig) {
        await trx.rollback();
        const response = new WithoutDataResource(
          403,
          "FORBIDDEN_QUIZ_ACCESS",
          "Akses Ditolak",
          "Anda tidak berhak submit jawaban untuk kuis yang bukan milik anda."
        );
        return res.status(403).json(response.toResponse());
      }

      // Cegah untuk attempt yang sudah selesai/abandoned
      if (
        [QUIZ_STATUS.FINISHED, QUIZ_STATUS.ABANDONED].includes(
          Number(attempt.quiz_attempt_status)
        )
      ) {
        await trx.rollback();
        const response = new WithoutDataResource(
          409,
          "ATTEMPT_CLOSED",
          "Attempt Tidak Aktif",
          "Kuis sudah selesai/ditutup, tidak dapat mengirim jawaban."
        );
        return res.status(409).json(response.toResponse());
      }

      // code untuk final step quiz when all answered
      summary = await handleFinalQuestion(trx, {
        learningAttemptId,
        topicId: attempt.kmis_topic_id,
        req,
      });

      try {
        certFile = await generateCertificateFile(trx, {
          learningAttemptId,
        });
        const certificateId = await uploadCertificateAndAttach(trx, {
          req,
          learningAttemptId,
          file: certFile,
        });

        logger.info(
          `| Quiz Attempt KMIS | - Automated certificate created: ${certificateId}, at ${new Date().toISOString()}`
        );
      } catch (certErr) {
        await trx.rollback();
        logger.error(
          `| Quiz Attempt KMIS | - Automated certificate failure: ${certErr.message}`
        );
        const response = new WithoutDataResource(
          500,
          "SERVER_ERROR",
          "Gagal Membuat Sertifikat",
          "Terjadi kesalahan saat membuat/mengunggah sertifikat, silahkan coba lagi nanti atau hubungi admin."
        );
        return res.status(500).json(response.toResponse());
      }

      await trx.commit();

      await sendCertificateEmail({
        attemptId: learningAttemptId,
        certFile,
        summary,
      });

      const freshAttempt = await knex("kmis_learning_attempts")
        .where("id", learningAttemptId)
        .where("attempt_by", userId)
        .whereNull("deleted_at")
        .first();
      const resourcePayload = await learningParticipantResource(freshAttempt);

      const { answeredCount, totalQuiz, correctCount, score } = summary;
      const response = new WithDataResource(
        200,
        "SUCCESS_FINISH_QUIZ",
        "Berhasil Menyimpan Data",
        `Semua jawaban yang dipilih berhasil disubmit. Terjawab: ${answeredCount}/${totalQuiz}, benar: ${correctCount}, skor: ${score}.`,
        resourcePayload
      );
      return res.status(200).json(response.toResponse());
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Quiz Attempt KMIS | - Error function storeQuizAttempt: ${error.message}`
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

exports.feedback = async (req, res) => {
  const trx = await knex.transaction();
  const { feedback, comment } = req.body;
  const { id } = req.params;
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

    const attempt = await trx("kmis_learning_attempts")
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!attempt) {
      await trx.rollback();
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Pembelajaran dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const attemptByBig = BigInt(String(attempt.attempt_by));
    const userIdBig = BigInt(String(userId));
    if (attemptByBig !== userIdBig) {
      await trx.rollback();
      const response = new WithoutDataResource(
        403,
        "FORBIDDEN_QUIZ_ACCESS",
        "Akses Ditolak",
        "Anda tidak berhak submit feedback untuk kuis yang bukan milik anda."
      );
      return res.status(403).json(response.toResponse());
    }

    if ([QUIZ_STATUS.STARTED].includes(Number(attempt.quiz_attempt_status))) {
      await trx.rollback();
      const response = new WithoutDataResource(
        409,
        "FEEDBACK_NOT_ALLOWED",
        "Feedback Tidak Diperbolehkan",
        "Kuis sedang berjalan, tidak dapat mengirim feedback."
      );
      return res.status(409).json(response.toResponse());
    }

    await trx("kmis_learning_attempts").where("id", id).update({
      feedback,
      feedback_comment: comment,
      updated_at: trx.fn.now(),
    });

    await trx.commit();
    const response = new WithoutDataResource(
      200,
      "SUCCESS_UPDATE_DATA",
      "Feedback Berhasil Diperbarui",
      `Feedback untuk pembelajaran ID '${id}' diperbarui menjadi ${feedback}.`
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    await trx.rollback();
    logger.error(
      `| Learning Attempt KMIS | - Error function feedback : ${error.message}`
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

async function validateLearningProgress(learningAttemptId) {
  const attempt = await knex("kmis_learning_attempts as a")
    .where("a.id", learningAttemptId)
    .select(["a.kmis_topic_id", "a.completed_material_ids"])
    .first();
  if (!attempt) {
    throw new Error("Topik atau pembelajaran tidak ditemukan");
  }

  const [{ total: totalStr }] = await knex("kmis_materials")
    .where("kmis_topic_id", attempt.kmis_topic_id)
    .whereNull("deleted_at")
    .count("* as total");

  const totalMaterial = Number(totalStr ?? 0);

  const completedMaterial = attempt.completed_material_ids?.length ?? 0;

  console.log(
    `completedMaterial: ${completedMaterial}, totalMaterial: ${totalMaterial}`
  );

  return completedMaterial === totalMaterial;
}

async function validateQuizDuration(learningAttemptId) {
  const row = await knex("kmis_learning_attempts as a")
    .join("kmis_topics as t", "a.kmis_topic_id", "t.id")
    .where("a.id", learningAttemptId)
    .select("t.quiz_duration", "a.quiz_started")
    .first();

  if (!row) throw new Error("Topik atau pembelajaran tidak ditemukan.");

  const limitSec = Number(row.quiz_duration ?? 0);

  // Tanpa limit → selalu boleh lanjut
  if (!Number.isFinite(limitSec) || limitSec <= 0) return true;

  // Belum mulai (quiz_started null) → timer belum jalan → boleh lanjut
  if (!row.quiz_started) return true;

  const startUTC = dateHelper.toUTC(row.quiz_started);
  const nowUTC = dateHelper.toUTC(new Date());

  if (!startUTC || !nowUTC) return true;
  const elapsedSec = Math.max(0, Math.floor((nowUTC - startUTC) / 1000));

  // Masih dalam durasi → true; lewat → false
  return elapsedSec <= limitSec;
}

async function attemptExamResponse(learningAttemptId) {
  // 1) Ambil attempt minimal
  const attempt = await knex("kmis_learning_attempts")
    .where("id", learningAttemptId)
    .select(["id", "attempt_by", "kmis_topic_id"])
    .whereNull("deleted_at")
    .first();

  if (!attempt) {
    return { learningParticipant: null, exam: [] };
  }

  // 2) Participant (rename attemptUser -> attemptBy)
  const lp = await learningParticipantResource(attempt);
  const learningParticipant = {
    id: lp.id,
    attemptUser: lp.attemptUser || null,
    topic: lp.topic || null,
  };

  // 3) Ambil total_quiz dari topik untuk target panjang array
  const topicRow = await knex("kmis_topics")
    .where("id", attempt.kmis_topic_id)
    .whereNull("deleted_at")
    .select(["id", "total_quiz"])
    .first();
  const totalTarget = Number(topicRow?.total_quiz ?? 0);

  // 4) Semua quiz pada topik (urut konsisten)
  const quizzes = await knex("kmis_quiz")
    .where("kmis_topic_id", attempt.kmis_topic_id)
    .whereNull("deleted_at")
    .select(["id", "question", "answer_a", "answer_b", "answer_c", "answer_d"])
    .orderBy("id", "asc");

  // 5) Jawaban aktif untuk attempt ini
  const responses = await knex("kmis_quiz_responses as r")
    .select([
      "r.id",
      "r.kmis_quiz_id",
      "r.selected_option",
      "r.is_marker",
      "r.answered_at",
    ])
    .where("r.kmis_learning_attempt_id", learningAttemptId)
    .whereNull("r.deleted_at");

  // 6) Index jawaban by quiz_id (ambil yang terbaru jika ada duplikat)
  const respByQuizId = new Map();
  for (const r of responses) {
    const prev = respByQuizId.get(r.kmis_quiz_id);
    if (!prev || new Date(r.answered_at) > new Date(prev.answered_at)) {
      respByQuizId.set(r.kmis_quiz_id, r);
    }
  }

  // 7) Susun exam dari kuis yang ada
  const exam = quizzes.map((q) => {
    const resp = respByQuizId.get(q.id) || null;
    const quizPayload = {
      id: q.id,
      question: q.question,
      answerA: q.answer_a,
      answerB: q.answer_b,
      answerC: q.answer_c,
      answerD: q.answer_d,
    };
    return {
      id: resp ? resp.id : null,
      quiz: quizPayload, // selalu ada untuk kuis yang eksis
      selectedOption: resp ? resp.selected_option : null,
      isMarker: resp ? !!resp.is_marker : null,
      answeredAt: resp ? resp.answered_at : null,
    };
  });

  // 8) Pad dengan null sampai panjang == total_quiz (jika total_quiz > jumlah kuis aktual)
  if (Number.isFinite(totalTarget) && totalTarget > exam.length) {
    const toPad = totalTarget - exam.length;
    for (let i = 0; i < toPad; i++) exam.push(null);
  }

  return { learningParticipant, exam };
}

async function handleFinalQuestion(trx, { learningAttemptId, topicId, req }) {
  const aggActive = await trx("kmis_quiz_responses")
    .where("kmis_learning_attempt_id", learningAttemptId)
    .whereNull("deleted_at")
    .select([
      trx.raw("COUNT(*)::int AS answered_count"),
      trx.raw(
        "SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct_count"
      ),
    ])
    .first();

  const [{ total: totalQuizStr }] = await trx("kmis_quiz")
    .where("kmis_topic_id", topicId)
    .whereNull("deleted_at")
    .count("* as total");

  const answeredCount = Number(aggActive?.answered_count || 0);
  const correctCount = Number(aggActive?.correct_count || 0);
  const totalQuiz = Number(totalQuizStr || 0);
  const wrongCount = Math.max(answeredCount - correctCount, 0);
  const emptyCount = Math.max(totalQuiz - answeredCount, 0);

  const finishedAtDb = dateHelper.toUTC(new Date().toISOString());

  const durationExpr = trx.raw(
    "GREATEST(EXTRACT(EPOCH FROM (?::timestamp without time zone - COALESCE(quiz_started, ?::timestamp without time zone)))::int, 0)",
    [finishedAtDb, finishedAtDb]
  );

  const score = computeScorePercent(correctCount, totalQuiz, 2);

  let quizAttemptStatus = QUIZ_STATUS.FINISHED;
  if (answeredCount !== totalQuiz) {
    quizAttemptStatus = QUIZ_STATUS.ABANDONED;
  }

  await trx("kmis_learning_attempts").where("id", learningAttemptId).update({
    quiz_assessment_status: true,
    quiz_finished: finishedAtDb,
    quiz_duration: durationExpr,

    questions_answered: answeredCount,
    completed_quiz: answeredCount,
    correct_count: correctCount,
    wrong_count: wrongCount,
    empty_count: emptyCount,
    score_total: score,

    quiz_attempt_status: quizAttemptStatus,
    updated_at: trx.fn.now(),
  });

  await activityLogHelper.logCreate(
    {
      userId: activityLogHelper.fromReq(req),
      module: "kmis",
      subject: "Pembelajaran Materi & Quiz",
      description: `Menyelesaikan kuis dengan attempt_id=${learningAttemptId} (answered=${answeredCount}/${totalQuiz}, correct=${correctCount}, score=${score})`,
    },
    trx
  );

  return { answeredCount, totalQuiz, correctCount, score };
}

function computeScorePercent(correct, total, decimals = 2) {
  const c = Number(correct || 0);
  const t = Number(total || 0);
  if (t <= 0) return 0;
  const raw = (c / t) * 100;
  const factor = 10 ** decimals;
  return Math.round(raw * factor) / factor;
}

async function generateCertificateFile(trx, { learningAttemptId }) {
  const attempt = await trx("kmis_learning_attempts as a")
    .leftJoin("users as u", "u.id", "a.attempt_by")
    .leftJoin("kmis_topics as t", "t.id", "a.kmis_topic_id")
    .where("a.id", learningAttemptId)
    .whereNull("a.deleted_at")
    .select([
      "a.id",
      "a.score_total",
      "a.quiz_started",
      trx.raw("COALESCE(u.name, '') as user_name"),
      trx.raw("COALESCE(t.title, '') as topic_name"),
    ])
    .first();

  if (!attempt) {
    throw new Error(
      `Attempt #${learningAttemptId} tidak ditemukan saat generate sertifikat.`
    );
  }

  // Siapkan data tampilan
  const topicName = attempt.topic_name || "-";
  const userName = stripTitlesOnly(attempt.user_name || "-");
  const scoreNum = Number(attempt.score_total || 0);
  const scoreStr = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(scoreNum);
  const startedAtStr = dateHelper.formatTanggalIndonesia(
    attempt.quiz_started,
    1
  );
  const printedAtStr = dateHelper.formatTanggalIndonesia(
    new Date().toISOString(),
    1
  );

  // Render PDF ke Buffer
  const buffer = await new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 50,
        info: {
          Title: `Certificate Attempt #${attempt.id}`,
          Author: "Rimba",
          Subject: "Kuis Completion Certificate",
        },
      });

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Border
      doc
        .lineWidth(2)
        .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
        .stroke();

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

      // Nama
      doc.moveDown(0.3);
      doc
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(userName, { align: "center" });

      // Garis tipis
      doc.moveDown(0.6);
      const centerX = doc.page.width / 2;
      doc
        .moveTo(centerX - 150, doc.y)
        .lineTo(centerX + 150, doc.y)
        .stroke();

      // Detail
      doc.moveDown(1.2);
      doc
        .font("Helvetica")
        .fontSize(14)
        .text(`Topik: ${topicName}`, { align: "center" });
      doc.moveDown(0.2);
      doc.text(`Nilai Akhir: ${scoreStr}`, { align: "center" });
      doc.moveDown(0.2);
      doc.text(`Mulai Mengerjakan: ${startedAtStr}`, { align: "center" });

      // Footer
      doc.moveDown(2);
      doc
        .fontSize(12)
        .text(`Dicetak pada: ${printedAtStr}`, 50, doc.page.height - 90, {
          width: doc.page.width - 100,
          align: "right",
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

  // Bentuk "file object" kompatibel upload helper
  const filename = `certificate-${attempt.id}.pdf`;
  const file = {
    fieldname: "files[]", // generic
    originalname: filename,
    mimetype: "application/pdf",
    buffer, // <<== penting: in-memory buffer
    size: buffer.length,
  };

  return file;
}

async function uploadCertificateAndAttach(
  trx,
  { req, learningAttemptId, file }
) {
  const uploadedDocuments = await documentHelper.uploadDocuments([file], req);
  const firstId = uploadedDocuments?.[0];
  const documentId = Number(firstId || 0);

  if (!documentId) {
    throw new Error("Gagal mengunggah sertifikat ke storage server.");
  }

  await trx("kmis_learning_attempts")
    .where("id", learningAttemptId)
    .update({
      certificate_ids: asJsonb([documentId]),
      updated_at: trx.fn.now(),
    });

  return documentId;
}

async function sendCertificateEmail({ attemptId, certFile, summary }) {
  try {
    if (!certFile?.buffer || !certFile?.originalname) {
      logger.warn(
        `| Quiz Attempt KMIS | - No certificate to send for attempt_id=${attemptId}`
      );
      return false;
    }

    // Ambil data user & topik
    const attempt = await knex("kmis_learning_attempts as a")
      .leftJoin("users as u", "u.id", "a.attempt_by")
      .leftJoin("kmis_topics as t", "t.id", "a.kmis_topic_id")
      .where("a.id", attemptId)
      .whereNull("a.deleted_at")
      .first([
        "a.id",
        "a.kmis_topic_id",
        "a.attempt_by",
        knex.raw("COALESCE(u.name, '') as user_name"),
        knex.raw("COALESCE(u.email, '') as user_email"),
        knex.raw("COALESCE(t.title, '') as topic_name"),
      ]);

    const finalEmail = attempt?.user_email?.trim();
    if (!finalEmail) {
      logger.warn(
        `| Quiz Attempt KMIS | - No email found for attempt_id=${attemptId}, skipping email.`
      );
      return false;
    }

    const displayName = stripTitlesOnly(attempt?.user_name || "-");
    const topicTitle = attempt?.topic_name || "-";
    const scoreVal = summary?.score ?? null;

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
    });

    const htmlBody = renderEmailTemplate("kmis_certificate_email.html", {
      name: displayName,
      topic_name: topicTitle,
      score: scoreVal,
      from_email: process.env.MAIL_USERNAME,
      year: new Date().getFullYear(),
    });

    await transporter.sendMail({
      from: `"Rimba" <${process.env.MAIL_USERNAME}>`,
      to: finalEmail,
      subject: `Sertifikat Kelulusan KMIS - ${topicTitle}`,
      html: htmlBody,
      attachments: [
        {
          filename: certFile.originalname,
          content: certFile.buffer,
          contentType: certFile.mimetype || "application/pdf",
        },
      ],
    });

    logger.info(
      `| Quiz Attempt KMIS | - Certificate email sent to ${finalEmail} (attempt_id=${attemptId})`
    );
    return true;
  } catch (mailErr) {
    logger.error(
      `| Quiz Attempt KMIS | - Failed to send certificate email (attempt_id=${attemptId}): ${mailErr.message}`
    );
    return false;
  }
}
