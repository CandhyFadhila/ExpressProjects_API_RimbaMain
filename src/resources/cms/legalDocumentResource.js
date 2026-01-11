const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const legalDocsCategoryResource = require("../masterData/legalDocsCategoryResource");
const documentResource = require("../../resources/doc/documentResource");

async function legalDocumentResource(legalDocument) {
  const category = legalDocument.cms_legal_docs_categories_id
    ? await knex("cms_legal_docs_categories")
        .where("id", legalDocument.cms_legal_docs_categories_id)
        .first()
    : null;

  const document = await resolveArrayRelations(
    legalDocument.document_ids,
    "documents",
    documentResource
  );

  return {
    id: legalDocument.id,
    documentCategory: category ? await legalDocsCategoryResource(category) : null,
    document: document,
    title: legalDocument.title,
    description: legalDocument.description,
    createdAt: legalDocument.created_at,
    updatedAt: legalDocument.updated_at,
    deletedAt: legalDocument.deleted_at,
  };
}

module.exports = legalDocumentResource;
