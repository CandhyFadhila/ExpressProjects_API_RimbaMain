const knex = require("../../config/database");
const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const documentResource = require("../doc/documentResource");
const UserResource = require("../auth/UserResource");
const topicResource = require("./topicResource");

async function learningParticipantResource(quizParticipant) {
  const [user, topic] = await Promise.all([
    quizParticipant.attempt_by
      ? knex("users").where("id", quizParticipant.attempt_by).first()
      : null,
    quizParticipant.kmis_topic_id
      ? knex("kmis_topics").where("id", quizParticipant.kmis_topic_id).first()
      : null,
  ]);

  const certificates = await resolveArrayRelations(
    quizParticipant.certificate_ids,
    "documents",
    documentResource
  );

  // TODO: Buat fitur student (create learning quiz) dulu baru bisa di test
  return {
    id: quizParticipant.id,
    attemptUser: user ? await UserResource(user) : null,
    topic: topic ? await topicResource(topic) : null,
    attemptStatus: quizParticipant.quiz_attempt_status,
    assessmentStatus: quizParticipant.quiz_assessment_status,
    totalMaterial: quizParticipant.total_material,
    totalQuiz: quizParticipant.total_quiz,
    completedMaterial: quizParticipant.completed_material,
    completedQuiz: quizParticipant.completed_quiz,
    quizStarted: quizParticipant.quiz_started,
    quizFinished: quizParticipant.quiz_finished,
    quizDuration: quizParticipant.quiz_duration,
    totalQuestion: quizParticipant.total_questions,
    questionsAnswered: quizParticipant.questions_answered,
    correctCount: quizParticipant.correct_count,
    wrongCount: quizParticipant.wrong_count,
    emptyCount: quizParticipant.empty_count,
    scoreTotal: quizParticipant.score_total,
    feedback: quizParticipant.feedback,
    certificate: certificates,
    createdAt: quizParticipant.created_at,
    updatedAt: quizParticipant.updated_at,
    deletedAt: quizParticipant.deleted_at,
  };
}

module.exports = learningParticipantResource;
