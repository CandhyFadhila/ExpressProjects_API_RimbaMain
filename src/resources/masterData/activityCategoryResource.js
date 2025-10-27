async function activityCategoryResource(category) {
  return {
    id: category.id,
    title: category.title,
    description: category.description,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
    deletedAt: category.deleted_at,
  };
}

module.exports = activityCategoryResource;
