const knex = require("../../config/database");
const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const UserResource = require("../auth/UserResource");
const documentResource = require("../../resources/doc/documentResource");

async function monthlyRealizationResource(monthlyRealization) {
  const [validatedUser, editedUser] = await Promise.all([
    monthlyRealization.validate_by
      ? knex("users").where("id", monthlyRealization.validate_by).first()
      : null,
    monthlyRealization.edited_by
      ? knex("users").where("id", monthlyRealization.edited_by).first()
      : null,
  ]);

  const evidence_files = await resolveArrayRelations(
    monthlyRealization.evidence_file_ids,
    "documents",
    documentResource
  );

  return {
    id: monthlyRealization.id,
    validatedUser: validatedUser ? await UserResource(validatedUser) : null,
    editedUser: editedUser ? await UserResource(editedUser) : null,
    evidence: evidence_files,
    month: monthlyRealization.month,
    year: monthlyRealization.year,
    budgedRealization: monthlyRealization.budged_realization,
    progress: monthlyRealization.progress,
    description: monthlyRealization.description,
    problem: monthlyRealization.problem,
    validationStatus: monthlyRealization.validation_status,
    rejectionReason: monthlyRealization.rejection_message,
    validateAt: monthlyRealization.validate_at,
    createdAt: monthlyRealization.created_at,
    updatedAt: monthlyRealization.updated_at,
    deletedAt: monthlyRealization.deleted_at,
  };
}

module.exports = monthlyRealizationResource;
