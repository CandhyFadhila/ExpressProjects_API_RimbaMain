const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const knex = require("../../config/database");
const categoryResource = require("../../resources/kmis/categoryResource");
const documentResource = require("../../resources/doc/documentResource");

async function topicResource(topic) {
  const category = topic.kmis_categories_id
    ? await knex("kmis_categories").where("id", topic.kmis_categories_id).first()
    : null;

  const photos = await resolveArrayRelations(
    topic.topic_cover_ids,
    "documents",
    documentResource
  );

  return {
    id: topic.id,
    category: category ? await categoryResource(category) : null,
    topicCover: photos,
    title: topic.title,
    description: topic.description,
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
    deeltedAt: topic.deleted_at,
  };
}

module.exports = topicResource;
