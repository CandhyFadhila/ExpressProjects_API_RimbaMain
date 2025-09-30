const knex = require("../../config/database");
const topicResource = require("./topicResource");

async function quizResource(quiz) {
  const topic = quiz.kmis_topic_id
    ? await knex("kmis_topics")
        .where("id", quiz.kmis_topic_id)
        .first()
    : null;

  return {
    id: quiz.id,
    topic: topic ? await topicResource(topic) : null,
    question: quiz.question,
    answerA: quiz.answer_a,
    answerB: quiz.answer_b,
    answerC: quiz.answer_c,
    answerD: quiz.answer_d,
    correctOption: quiz.correct_option,
    explanation: quiz.explanation,
    createdAt: quiz.created_at,
    updatedAt: quiz.updated_at,
    deletedAt: quiz.deleted_at,
  };
}

module.exports = quizResource;
