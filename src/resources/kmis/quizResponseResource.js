const knex = require("../../config/database");
const quizResource = require("../../resources/kmis/quizResource");

/**
 * @param {Object} quizResponse - row dari kmis_quiz_responses
 * @param {Object} [opts]
 * @param {Object|null} [opts.quizRow] - row kmis_quiz yang sudah di-preload (optional)
 * @param {boolean} [opts.includeQuiz=true] - kalau false, field quiz = null tanpa load
 */
async function quizResponseResource(quizResponse, opts = {}) {
  const { quizRow = null, includeQuiz = true } = opts;

  let quiz = null;
  if (includeQuiz) {
    if (quizRow) {
      quiz = await quizResource(quizRow);
    } else if (quizResponse.kmis_quiz_id) {
      const row = await knex("kmis_quiz")
        .where("id", quizResponse.kmis_quiz_id)
        .first();
      quiz = row ? await quizResource(row) : null;
    }
  }

  return {
    id: quizResponse.id,
    quiz,
    selectedOption: quizResponse.selected_option,
    isMarker: quizResponse.is_marker,
    isCorrect: quizResponse.is_correct,
    answeredAt: quizResponse.answered_at,
    createdAt: quizResponse.created_at,
    updatedAt: quizResponse.updated_at,
    deletedAt: quizResponse.deleted_at,
  };
}

module.exports = quizResponseResource;
