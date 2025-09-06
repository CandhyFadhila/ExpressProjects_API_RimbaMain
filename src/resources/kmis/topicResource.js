const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const knex = require("../../config/database");
const categoryResource = require("../../resources/kmis/categoryResource");

async function topicResource(topic) {
  const category = topic.kmis_categories_id
    ? await knex("kmis_categories").where("id", topic.kmis_categories_id).first()
    : null;

  const photos = await resolveArrayRelations(
    topic.topic_cover_ids,
    "documents"
  );

  return {
    id: topic.id,
    category: category ? await categoryResource(category) : null,
    topic_cover: photos,
    title: topic.title,
    description: topic.description,
    created_at: topic.created_at,
    updated_at: topic.updated_at,
    deleted_at: topic.deleted_at,
  };
}

module.exports = topicResource;
