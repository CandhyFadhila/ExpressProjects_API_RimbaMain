async function newsCategoryResource(newsCategory) {
  return {
    id: newsCategory.id,
    name: newsCategory.name,
    description: newsCategory.description,
    createdAt: newsCategory.created_at,
    updatedAt: newsCategory.updated_at,
    deletedAt: newsCategory.deleted_at
  };
}

module.exports = newsCategoryResource;
