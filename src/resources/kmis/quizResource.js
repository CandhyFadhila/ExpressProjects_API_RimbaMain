const knex = require("../../config/database");
const quizCategoryResource = require("./quizCategoryResource");

async function quizResource(quiz) {
  const category = quiz.kmis_quiz_categories_id
    ? await knex("kmis_quiz_categories")
        .where("id", quiz.kmis_quiz_categories_id)
        .first()
    : null;

  return {
    id: quiz.id,
    quizCategory: category ? await quizCategoryResource(category) : null,
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
