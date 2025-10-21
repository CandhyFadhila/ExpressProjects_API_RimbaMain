async function faqResource(faq) {
  return {
    id: faq.id,
    name: faq.name,
    description: faq.description,
    createdAt: faq.created_at,
    updatedAt: faq.updated_at,
    deletedAt: faq.deleted_at
  };
}

module.exports = faqResource;
