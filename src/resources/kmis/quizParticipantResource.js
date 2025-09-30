const knex = require("../../config/database");
const UserResource = require("../auth/UserResource");
const quizResponseResource = require("./quizResponseResource");

async function quizParticipantResource(quizParticipant) {
  // Jalankan query hubungan utama secara paralel
  const [user, responses] = await Promise.all([
    quizParticipant.attempt_by
      ? knex("users").where("id", quizParticipant.attempt_by).first()
      : null,
    knex("kmis_quiz_responses")
      .where("kmis_quiz_attempt_id", quizParticipant.id)
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
    id: quizParticipant.id,
    attemptUser: user ? await UserResource(user) : null,
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
    quizResponses,
    createdAt: quizParticipant.created_at,
    updatedAt: quizParticipant.updated_at,
    deletedAt: quizParticipant.deleted_at,
  };
}

module.exports = quizParticipantResource;
