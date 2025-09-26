const knex = require("../../config/database");
const categoryResource = require("./categoryResource");
const topicResource = require("./topicResource");

async function quizCategoryResource(quizCategory) {
  const category = quizCategory.kmis_categories_id
    ? await knex("kmis_categories")
        .where("id", quizCategory.kmis_categories_id)
        .first()
    : null;

  const topic = quizCategory.kmis_topics_id
    ? await knex("kmis_topics").where("id", quizCategory.kmis_topics_id).first()
    : null;

  return {
    id: quizCategory.id,
    category: category ? await categoryResource(category) : null,
    topic: topic ? await topicResource(topic) : null,
    name: quizCategory.name,
    description: quizCategory.description,
    totalQuestion: quizCategory.total_question,
    createdAt: quizCategory.created_at,
    updatedAt: quizCategory.updated_at,
    deletedAt: quizCategory.deleted_at,
  };
}

module.exports = quizCategoryResource;
