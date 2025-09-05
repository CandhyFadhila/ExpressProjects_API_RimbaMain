const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");

async function categoryResource(category) {
  const photos = await resolveArrayRelations(
    category.category_cover_ids,
    "documents"
  );

  return {
    id: category.id,
    category_cover: photos,
    title: category.title,
    description: category.description,
    created_at: category.created_at,
    updated_at: category.updated_at,
    deleted_at: category.deleted_at,
  };
}

module.exports = categoryResource;
