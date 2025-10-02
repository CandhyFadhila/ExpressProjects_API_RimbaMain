const knex = require("../../config/database");
const quizResource = require("../kmis/quizResource");
const learningParticipantResource = require("../kmis/learningParticipantResource");

async function quizResponseResource(quizResponse) {
  const [quiz, learningParticipant] = await Promise.all([
    quizResponse.kmis_quiz_id
      ? knex("kmis_quiz").where("id", quizResponse.kmis_quiz_id).first()
      : null,
    quizResponse.kmis_learning_attempt_id
      ? knex("kmis_learning_attempts")
          .where("id", quizResponse.kmis_learning_attempt_id)
          .first()
      : null,
  ]);

  return {
    id: quizResponse.id,
    learningParticipant: learningParticipant
      ? await learningParticipantResource(learningParticipant)
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
