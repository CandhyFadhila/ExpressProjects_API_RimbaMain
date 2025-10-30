const { y } = require("pdfkit");
const knex = require("../../config/database");
const UserResource = require("../auth/UserResource");

async function targetResource(target) {
  const [validatedUser, editedUser] = await Promise.all([
    target.validate_by
      ? knex("users").where("id", target.validate_by).first()
      : null,
    target.edited_by
      ? knex("users").where("id", target.edited_by).first()
      : null
  ]);

  return {
    id: target.id,
    validatedUser: validatedUser ? await UserResource(validatedUser) : null,
    editedUser: editedUser ? await UserResource(editedUser) : null,
    month: target.month,
    year: target.year,
    budgedTarget: target.budged_target,
    physicalTarget: target.physical_target,
    description: target.description,
    validationStatus: target.validation_status,
    rejectionReason: target.rejection_message,
    validateAt: target.validate_at,
    createdAt: target.created_at,
    updatedAt: target.updated_at,
    deletedAt: target.deleted_at,
  };
}

module.exports = targetResource;
