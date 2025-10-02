const knex = require("../../config/database");
const UserResource = require("../../resources/auth/UserResource");

async function studentResource(student) {
  const user = await knex("users").where("id", student.id).first();

  const statsRow = await knex("kmis_learning_attempts")
    .where("attempt_by", user.id)
    .whereNull("deleted_at")
    .select(
      knex.raw("COUNT(*)::int AS total_attempts"),
      knex.raw(
        "SUM(CASE WHEN quiz_attempt_status = 2 THEN 1 ELSE 0 END)::int AS total_finished"
      ),
      knex.raw(
        "COALESCE(AVG(CASE WHEN quiz_attempt_status = 2 THEN score_total END), 0)::double precision AS avg_score_finished"
      ),
      knex.raw("COUNT(DISTINCT kmis_topic_id)::int AS total_topics_taken")
    )
    .first();

  return {
    id: user.id,
    user: user ? await UserResource(user) : null,
    totalTopic: Number(statsRow?.total_topics_taken ?? 0),
    totalAttempts: Number(statsRow?.total_attempts ?? 0),
    totalFinished: Number(statsRow?.total_finished ?? 0),
    avgScoreFinished: Number(statsRow?.avg_score_finished ?? 0),
    createdAt: student.created_at,
    updatedAt: student.updated_at,
    deletedAt: student.deleted_at,
  };
}

module.exports = studentResource;
