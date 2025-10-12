const knex = require("../../config/database");
const logger = require("../../utils/logger");
const { toArray } = require("../../helpers/inputNorm");
const {
  applySearch,
  applyPagination,
  applyRelationIn,
  formatPaginationResult,
} = require("../../helpers/queryHelper");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");
const learningParticipantResource = require("../../resources/kmis/learningParticipantResource");
const quizResponseResource = require("../../resources/kmis/quizResponseResource");
const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");

exports.index = async (req, res) => {
  const { search, topicId, status } = req.query;

  try {
    let query = knex("kmis_learning_attempts as quizParticipant")
      .leftJoin("users as user", "quizParticipant.attempt_by", "user.id")
      .leftJoin(
        "kmis_topics as topic",
        "quizParticipant.kmis_topic_id",
        "topic.id"
      )
      .select("quizParticipant.*")
      .orderBy("quizParticipant.created_at", "desc");

    applyTrashedScope(query, req, "quizParticipant.deleted_at");

    applyRelationIn(query, "quiz.kmis_topic_id", topicId, {
      as: "number",
    });

    if (status) {
      const statusArray = toArray(status).map(Number);
      const validStatus = statusArray.filter((s) => [1, 2, 3].includes(s));
      if (validStatus.length > 0) {
        query = query.whereIn(
          "quizParticipant.quiz_attempt_status",
          validStatus
        );
      }
    }

    applySearch(query, search, ["user.name", "topic.title"]);

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

exports.show = async (req, res) => {
  const { id } = req.params;

  try {
    const attempt = await knex("kmis_learning_attempts")
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!attempt) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Data partisipan ujian dengan ID '${id}' tidak ditemukan.`
      );
      return res.status(200).json(response.toResponse());
    }

    const topicId = attempt.kmis_topic_id;
    if (!topicId) {
      const rows = await knex("kmis_quiz_responses as r")
        .select("r.*")
        .where("r.kmis_learning_attempt_id", id)
        .whereNull("r.deleted_at")
        .orderBy("r.answered_at", "asc");
      if (rows.length === 0) {
        const response = new WithoutDataResource(
          200,
          "DATA_NOT_FOUND",
          "Data Tidak Ditemukan",
          `Data jawaban kuis untuk attempt '${id}' tidak ditemukan.`
        );
        return res.status(200).json(response.toResponse());
      }

      const [learningParticipant, exam] = await Promise.all([
        learningParticipantResource(attempt),
        Promise.all(rows.map((row) => quizResponseResource(row))),
      ]);

      const response = new WithDataResource(
        200,
        "SUCCESS_GET_DATA",
        "Berhasil Mengambil Data",
        "Detail jawaban kuis yang dikerjakan peserta berhasil didapatkan.",
        { learningParticipant, exam }
      );
      return res.status(200).json(response.toResponse());
    }

    // === Mode ideal: tampilkan SEMUA QUIZ pada topik attempt ===
    // 1) Ambil semua quiz di topik (urutkan stabil)
    const quizzes = await knex("kmis_quiz as q")
      .select("q.*")
      .whereNull("q.deleted_at")
      .where(function () {
        this.where("q.kmis_topic_id", topicId);
      })
      .orderBy("q.created_at", "asc");

    // 2) Ambil semua response attempt ini
    const responses = await knex("kmis_quiz_responses as r")
      .select("r.*")
      .where("r.kmis_learning_attempt_id", id)
      .whereNull("r.deleted_at");

    // 3) Index response by quiz_id
    const respByQuizId = new Map(
      responses.map((r) => [Number(r.kmis_quiz_id), r])
    );

    // 4) Bentuk exam: untuk setiap quiz, gunakan response jika ada; jika tidak, null fields
    const examItems = [];
    for (const q of quizzes) {
      const r = respByQuizId.get(Number(q.id));
      if (r) {
        examItems.push(r);
      } else {
        examItems.push({
          id: null,
          kmis_learning_attempt_id: id,
          kmis_quiz_id: q.id,
          selected_option: null,
          is_marker: null,
          is_correct: null,
          answered_at: null,
          created_at: null,
          updated_at: null,
          deleted_at: null,
        });
      }
    }

    if (examItems.length === 0) {
      const response = new WithoutDataResource(
        200,
        "DATA_NOT_FOUND",
        "Data Tidak Ditemukan",
        `Tidak ada soal kuis aktif untuk topik attempt '${id}'.`
      );
      return res.status(200).json(response.toResponse());
    }

    // 5) Serialize:
    const [learningParticipant, exam] = await Promise.all([
      learningParticipantResource(attempt),
      Promise.all(examItems.map((item) => quizResponseResource(item))),
    ]);

    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Detail jawaban kuis yang dikerjakan peserta berhasil didapatkan.",
      { learningParticipant, exam }
    );
    return res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Quiz Partisipant KMIS | - Error function show: ${error.message}`
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
