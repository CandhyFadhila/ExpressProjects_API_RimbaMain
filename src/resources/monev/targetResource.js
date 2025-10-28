const knex = require("../../config/database");
const activityPackageResource = require("./activityPackageResource");

async function targetResource(target) {
  const activityPackage = target.monev_activity_packages_id
    ? await knex("monev_activity_packages")
        .where("id", target.monev_activity_packages_id)
        .first()
    : null;

  return {
    id: target.id,
    activityPackage: activityPackage
      ? await activityPackageResource(activityPackage)
      : null,
    month: target.month,
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
