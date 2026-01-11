async function legalDocsCategoryResource(legalDocsCategory) {
  return {
    id: legalDocsCategory.id,
    name: legalDocsCategory.name,
    description: legalDocsCategory.description,
    createdAt: legalDocsCategory.created_at,
    updatedAt: legalDocsCategory.updated_at,
    deletedAt: legalDocsCategory.deleted_at
  };
}

module.exports = legalDocsCategoryResource;
