async function faqResource(faq) {
  return {
    id: faq.id,
    question: faq.question,
    answer: faq.answer,
    createdAt: faq.created_at,
    updatedAt: faq.updated_at,
    deletedAt: faq.deleted_at
  };
}

module.exports = faqResource;
