const knex = require("../../config/database");
const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const documentResource = require("../../resources/doc/documentResource");
const materialResource = require("../../resources/kmis/materialResource");
const UserResource = require("../../resources/auth/UserResource");
const topicResource = require("../../resources/kmis/topicResource");

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

  const materials = await knex("kmis_materials")
    .whereIn("id", topic.material_order_ids || [])
    .select(
      "id",
      "kmis_topic_id",
      "materials_file_ids",
      "materials_cover_ids",
      "title",
      "material_types",
      "material_data",
      "description",
      "is_public"
    )
    .orderByRaw(`array_position(?, id)`, [topic.material_order_ids]);

  const materialResources = await Promise.all(
    materials.map((material) => materialResource(material))
  );

  return {
    id: quizParticipant.id,
    attemptUser: user ? await UserResource(user) : null,
    topic: topic ? await topicResource(topic) : null,
    completedMaterial: materialResources,
    attemptStatus: quizParticipant.quiz_attempt_status,
    assessmentStatus: quizParticipant.quiz_assessment_status,
    totalMaterial: quizParticipant.total_material,
    learningStarted: quizParticipant.learning_started,
    completedQuiz: quizParticipant.completed_quiz,
    quizStarted: quizParticipant.quiz_started,
    quizFinished: quizParticipant.quiz_finished,
    quizDuration: quizParticipant.quiz_duration,
    questionsAnswered: quizParticipant.questions_answered,
    correctCount: quizParticipant.correct_count,
    wrongCount: quizParticipant.wrong_count,
    emptyCount: quizParticipant.empty_count,
    scoreTotal: quizParticipant.score_total,
    feedback: quizParticipant.feedback,
    feedbackComment: quizParticipant.feedback_comment,
    certificate: certificates,
    createdAt: quizParticipant.created_at,
    updatedAt: quizParticipant.updated_at,
    deletedAt: quizParticipant.deleted_at,
  };
}

module.exports = learningParticipantResource;
