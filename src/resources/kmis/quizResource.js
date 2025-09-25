const knex = require("../../config/database");
const categoryResource = require("../../resources/kmis/categoryResource");
const topicResource = require("../../resources/kmis/topicResource");

async function quizResource(quiz) {
  const category = quiz.kmis_categories_id
    ? await knex("kmis_categories").where("id", quiz.kmis_categories_id).first()
    : null;

  const topic = quiz.kmis_topics_id
    ? await knex("kmis_topics").where("id", quiz.kmis_topics_id).first()
    : null;

  return {
    id: quiz.id,
    category: category ? await categoryResource(category) : null,
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
