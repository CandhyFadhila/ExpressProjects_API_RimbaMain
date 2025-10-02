const knex = require("../../config/database");
const quizResource = require("../kmis/quizResource");
const quizParticipantResource = require("../kmis/quizParticipantResource");

async function quizResponseResource(quizResponse) {
  const [quiz, quizParticipant] = await Promise.all([
    quizResponse.kmis_quiz_id
      ? knex("kmis_quiz").where("id", quizResponse.kmis_quiz_id).first()
      : null,
    quizResponse.kmis_quiz_attempt_id
      ? knex("kmis_quiz_attempts")
          .where("id", quizResponse.kmis_quiz_attempt_id)
          .first()
      : null,
  ]);

  return {
    id: quizResponse.id,
    quizParticipant: quizParticipant
      ? await quizParticipantResource(quizParticipant)
      : null,
    quiz: quiz ? await quizResource(quiz) : null,
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
