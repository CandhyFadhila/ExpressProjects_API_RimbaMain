const knex = require("../../config/database");
const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const documentResource = require("../../resources/doc/documentResource");
const UserResource = require("../auth/UserResource");
const topicResource = require("./topicResource");

async function quizParticipantResource(quizParticipant) {
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

  return {
    id: quizParticipant.id,
    attemptUser: user ? await UserResource(user) : null,
    topic: topic ? await topicResource(topic) : null,
    // totalLearning,
    // totalQuiz,
    // completedLearning,
    // completedQuiz,
    attemptStatus: quizParticipant.attempt_status,
    assessmentStatus: quizParticipant.assessment_status,
    startedAt: quizParticipant.started_at,
    finishedAt: quizParticipant.finished_at,
    duration: quizParticipant.duration,
    totalQuestions: quizParticipant.total_questions,
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

module.exports = quizParticipantResource;
