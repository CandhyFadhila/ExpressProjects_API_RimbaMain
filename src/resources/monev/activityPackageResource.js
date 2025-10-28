const knex = require("../../config/database");
const picDivisionResource = require("../masterData/picDivisionResource");
const UserResource = require("../auth/UserResource");

async function activityPackageResource(activity) {
  const [createdUser, validatedUser, editedUser, picDivision] =
    await Promise.all([
      activity.created_by
        ? knex("users").where("id", activity.created_by).first()
        : null,
      activity.validate_by
        ? knex("users").where("id", activity.validate_by).first()
        : null,
      activity.edited_by
        ? knex("users").where("id", activity.edited_by).first()
        : null,
      activity.monev_pic_division_id
        ? knex("monev_pic_divisions")
            .where("id", activity.monev_pic_division_id)
            .first()
        : null,
    ]);

  return {
    id: activity.id,
    createdUser: createdUser ? await UserResource(createdUser) : null,
    validatedUser: validatedUser ? await UserResource(validatedUser) : null,
    editedUser: editedUser ? await UserResource(editedUser) : null,
    picDivision: picDivision ? await picDivisionResource(picDivision) : null,
    contractType: activity.contract_type,
    mak: activity.mak,
    name: activity.name,
    description: activity.description,
    startedMonth: activity.started_month,
    finishedMonth: activity.finished_month,
    unitOutput: activity.unit_output,
    codeOutput: activity.code_output,
    volume: activity.volume,
    pagu: activity.pagu,
    partner: activity.partner,
    createdAt: activity.created_at,
    updatedAt: activity.updated_at,
    deletedAt: activity.deleted_at,
  };
}

module.exports = activityPackageResource;
