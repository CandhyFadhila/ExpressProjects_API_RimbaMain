const knex = require("../../config/database");
const UserResource = require("../../resources/auth/UserResource");
const categoryResource = require("../../resources/kmis/categoryResource");
const topicResource = require("../../resources/kmis/topicResource");
const quizResponseResource = require("../../resources/kmis/quizResponseResource");

async function quizAttemptResource(quizAttempt) {
  // Jalankan query hubungan utama secara paralel
  const [user, category, topic, responses] = await Promise.all([
    quizAttempt.attempt_by
      ? knex("users").where("id", quizAttempt.attempt_by).first()
      : null,
    quizAttempt.kmis_categories_id
      ? knex("kmis_categories")
          .where("id", quizAttempt.kmis_categories_id)
          .first()
      : null,
    quizAttempt.kmis_topics_id
      ? knex("kmis_topics").where("id", quizAttempt.kmis_topics_id).first()
      : null,
    knex("kmis_quiz_responses")
      .where("kmis_quiz_attempt_id", quizAttempt.id)
      .whereNull("deleted_at")
      .orderBy([
        { column: "answered_at", order: "asc" },
        { column: "id", order: "asc" },
      ]),
  ]);

  // Preload semua quiz yang dirujuk oleh responses (hilangkan N+1)
  const quizIds = [
    ...new Set(responses.map((r) => r.kmis_quiz_id).filter(Boolean)),
  ];
  const quizById = quizIds.length
    ? (await knex("kmis_quiz").whereIn("id", quizIds)).reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {})
    : {};

  const quizResponses = await Promise.all(
    responses.map((r) =>
      quizResponseResource(r, { quizRow: quizById[r.kmis_quiz_id] || null })
    )
  );

  return {
    id: quizAttempt.id,
    attemptUser: user ? await UserResource(user) : null,
    category: category ? await categoryResource(category) : null,
    topic: topic ? await topicResource(topic) : null,
    attemptStatus: quizAttempt.attempt_status,
    assessmentStatus: quizAttempt.assessment_status,
    startedAt: quizAttempt.started_at,
    finishedAt: quizAttempt.finished_at,
    duration: quizAttempt.duration,
    totalQuestions: quizAttempt.total_questions,
    correctCount: quizAttempt.correct_count,
    wrongCount: quizAttempt.wrong_count,
    emptyCount: quizAttempt.empty_count,
    scoreTotal: quizAttempt.score_total,
    quizResponses,
    createdAt: quizAttempt.created_at,
    updatedAt: quizAttempt.updated_at,
    deletedAt: quizAttempt.deleted_at,
  };
}

module.exports = quizAttemptResource;
