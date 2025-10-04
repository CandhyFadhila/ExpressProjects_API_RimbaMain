const knex = require("../../config/database");
const logger = require("../../utils/logger");
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
// const { applyTrashedScope } = require("../../helpers/roleAbilityCheckHelper");

exports.index = async (req, res) => {
  const { search, topicId } = req.query;

  try {
    let query = knex("kmis_learning_attempts as quizParticipant")
      .leftJoin("users as user", "quizParticipant.attempt_by", "user.id")
      .leftJoin(
        "kmis_topics as topic",
        "quizParticipant.kmis_topic_id",
        "topic.id"
      )
      .select("*")
      .orderBy("quizParticipant.created_at", "desc");

    // applyTrashedScope(query, req, "quizParticipant.deleted_at");

    applyRelationIn(query, "quiz.kmis_topic_id", topicId, {
      as: "number",
    });

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

    const rows = await knex("kmis_quiz_responses as r")
      .select([
        "r.id",
        "r.kmis_learning_attempt_id",
        "r.kmis_quiz_id",
        "r.selected_option",
        "r.is_marker",
        "r.is_correct",
        "r.answered_at",
        "r.created_at",
        "r.updated_at",
        "r.deleted_at",
      ])
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

    const serializedData = await Promise.all(
      rows.map((row) => quizResponseResource(row))
    );
    const response = new WithDataResource(
      200,
      "SUCCESS_GET_DATA",
      "Berhasil Mengambil Data",
      "Detail jawaban kuis yang dikerjakan peserta berhasil didapatkan.",
      serializedData
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
