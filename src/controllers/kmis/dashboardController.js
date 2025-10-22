const knex = require("../../config/database");
const logger = require("../../utils/logger");
const WithDataResource = require("../../resources/WithDataResource");
const WithoutDataResource = require("../../resources/WithoutDataResource");

exports.dashboardInfo = async (req, res) => {
  try {
    const totalEducator = await getInfoEducator();
    const totalStudent = await getInfoStudent();
    const totalTopic = await getInfoTopic();
    const totalMaterial = await getInfoMaterial();
    const totalQuiz = await getInfoQuiz();
    const totalUserAttemptParticipant = await getInfoUserAttempt();
    const averageScoreTotal = await getAvgScoreTotal();
    const averageFeedback = await getAvgFeedbackRate();
    const userStatsAttemptFinished = await getUserAttemptStatsFinished();

    const response = new WithDataResource(
      200,
      "DATA_FOUND",
      "Data Ditemukan",
      "Data dashboard KMIS berhasil didapatkan.",
      {
        totalEducator,
        totalStudent,
        totalTopic,
        totalMaterial,
        totalQuiz,
        totalUserAttemptParticipant,
        averageScoreTotal,
        averageFeedback,
        userStatsAttemptFinished,
      }
    );
    res.status(200).json(response.toResponse());
  } catch (error) {
    logger.error(
      `| Dashboard KMIS | - Error function dashboardInfo: ${error.message}`
    );
    const response = new WithoutDataResource(
      500,
      "SERVER_ERROR",
      "Server Sedang Error",
      "Terjadi kesalahan pada sistem, silahkan coba lagi nanti atau hubungi admin."
    );
    res.status(500).json(response.toResponse());
  }
};

async function getInfoEducator() {
  const row = await knex("users")
    .where("role_id", 2)
    .whereNull("deleted_at")
    .count({ total: "id" })
    .first();

  const value = Number(row?.total ?? 0);
  return { value };
}

async function getInfoStudent() {
  const row = await knex("users")
    .where("role_id", 3)
    .whereNull("deleted_at")
    .count({ total: "id" })
    .first();

  const value = Number(row?.total ?? 0);
  return { value };
}

async function getInfoTopic() {
  const row = await knex("kmis_topics")
    .whereNull("deleted_at")
    .count({ total: "id" })
    .first();

  const value = Number(row?.total ?? 0);
  return { value };
}

async function getInfoMaterial() {
  const row = await knex("kmis_materials")
    .whereNull("deleted_at")
    .count({ total: "id" })
    .first();

  const value = Number(row?.total ?? 0);
  return { value };
}

async function getInfoQuiz() {
  const row = await knex("kmis_quiz")
    .whereNull("deleted_at")
    .count({ total: "id" })
    .first();

  const value = Number(row?.total ?? 0);
  return { value };
}

async function getInfoUserAttempt() {
  const row = await knex("kmis_learning_attempts")
    .whereNull("deleted_at")
    .countDistinct({ total: "attempt_by" })
    .first();

  const value = Number(row?.total ?? 0);
  return { value };
}

async function getAvgScoreTotal() {
  const row = await knex("kmis_learning_attempts")
    .whereNull("deleted_at")
    .avg({ avg_score: "score_total" })
    .first();

  const average = row?.avg_score == null ? 0 : Number(row.avg_score);
  const value = Number(average.toFixed(2));

  return { value };
}

async function getAvgFeedbackRate() {
  const row = await knex("kmis_learning_attempts")
    .whereNull("deleted_at")
    .avg({ avg_feedback: "feedback" })
    .first();

  const average = row?.avg_feedback == null ? 0 : Number(row.avg_feedback);
  const value = Number(average.toFixed(2));

  return { value };
}

async function getUserAttemptStatsFinished() {
  const { rows } = await knex.raw(`
    WITH months AS (
      SELECT generate_series(1,12) AS mon
    ),
    stats AS (
      SELECT
        EXTRACT(MONTH FROM created_at)::int AS mon,
        COUNT(DISTINCT attempt_by)::int AS cnt
      FROM kmis_learning_attempts
      WHERE deleted_at IS NULL
        AND quiz_attempt_status = 2
        AND attempt_by IS NOT NULL
        AND created_at >= date_trunc('year', CURRENT_DATE)
        AND created_at <  date_trunc('year', CURRENT_DATE) + interval '1 year'
      GROUP BY 1
    )
    SELECT m.mon, COALESCE(s.cnt, 0)::int AS total
    FROM months m
    LEFT JOIN stats s ON s.mon = m.mon
    ORDER BY m.mon;
  `);

  const monthKeys = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // siapkan array 12 bulan diisi 0
  const totalsByMonth = Array(12).fill(0);

  // isi dari hasil query (mon = 1..12)
  for (const r of rows) {
    const idx = (r.mon ?? 1) - 1;
    totalsByMonth[idx] = Number(r.total) || 0;
  }

  // bentuk [{ name, value }]
  const data = monthKeys.map((name, i) => ({
    name,
    value: totalsByMonth[i],
  }));

  return data;
}
