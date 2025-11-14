const knex = require("../../config/database");
const quizResource = require("../kmis/quizResource");

async function quizResponseResource(quizResponse) {
  const quiz = quizResponse.kmis_quiz_id
    ? await knex("kmis_quiz").where("id", quizResponse.kmis_quiz_id).first()
    : null;

  return {
    id: quizResponse?.id ?? null,
    quiz: quiz ? await quizResource(quiz) : null,
    selectedOption: quizResponse?.selected_option ?? null,
    isMarker: quizResponse?.is_marker ?? null,
    isCorrect: quizResponse?.is_correct ?? null,
    answeredAt: quizResponse?.answered_at ?? null,
    createdAt: quizResponse?.created_at ?? null,
    updatedAt: quizResponse?.updated_at ?? null,
    deletedAt: quizResponse?.deleted_at ?? null,
  };
}

module.exports = quizResponseResource;
