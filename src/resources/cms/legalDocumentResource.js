const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const documentResource = require("../../resources/doc/documentResource");

async function legalDocumentResource(legalDocument) {
  const document = await resolveArrayRelations(
    legalDocument.document_ids,
    "documents",
    documentResource
  );

  return {
    id: legalDocument.id,
    document: document,
    title: legalDocument.title,
    description: legalDocument.description,
    createdAt: legalDocument.created_at,
    updatedAt: legalDocument.updated_at,
    deletedAt: legalDocument.deleted_at,
  };
}

module.exports = legalDocumentResource;
