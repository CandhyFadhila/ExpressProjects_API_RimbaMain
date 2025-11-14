const knex = require("../../config/database");
const topicResource = require("./topicResource");
const UserResource = require("../auth/UserResource");

async function quizResource(quiz) {
  const [topic, createdUser] = await Promise.all([
    quiz.kmis_topic_id
      ? await knex("kmis_topics").where("id", quiz.kmis_topic_id).first()
      : null,
    quiz.created_by ? knex("users").where("id", quiz.created_by).first() : null,
  ]);

  return {
    id: quiz.id,
    topic: topic ? await topicResource(topic) : null,
    createdUser: createdUser ? await UserResource(createdUser) : null,
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
