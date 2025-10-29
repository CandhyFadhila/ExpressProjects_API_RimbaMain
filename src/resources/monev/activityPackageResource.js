const knex = require("../../config/database");
const { orderByMonthIndex } = require("../../helpers/orderByMonthIndex");
const picDivisionResource = require("../masterData/picDivisionResource");
const UserResource = require("../auth/UserResource");
const targetResource = require("./targetResource");

async function activityPackageResource(activity) {
  const [createdUser, editedUser, picDivision] = await Promise.all([
    activity.created_by
      ? knex("users").where("id", activity.created_by).first()
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

  const { sql, bindings } = orderByMonthIndex("month_index", "asc");

  const [originals, pendings] = await Promise.all([
    knex("monev_targets")
      .where("monev_activity_packages_id", activity.id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings),
    knex("monev_target_pending_updates")
      .where("monev_activity_packages_id", activity.id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings),
  ]);

  const monevTargetOriginal = await Promise.all(
    originals.map((row) => targetResource(row, { activityPackage: activity }))
  );
  const monevTargetPendingUpdate = await Promise.all(
    pendings.map((row) => targetResource(row, { activityPackage: activity }))
  );

  return {
    id: activity.id,
    createdUser: createdUser ? await UserResource(createdUser) : null,
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
    target: {
      monevTargetOriginal,
      monevTargetPendingUpdate,
    },
    createdAt: activity.created_at,
    updatedAt: activity.updated_at,
    deletedAt: activity.deleted_at,
  };
}

module.exports = activityPackageResource;

// "target": { // ini resource target
//   "monevTargetOriginal": [
//         {
//           targetResource
//         }
//   ],
//   "monevTargetPendingUpdate": [
//         {
//           targetResource
//         }
//   ]
// },
// "monthlyRealization": { // ini resource monthlyRealization
//   "monevMonthlyRealizationtOriginal": [
//         {
//           Interface_MONEV_Monthly_Realization
//         }
//   ],
//   "monevMonthlyRealizationPendingUpdate": [
//         {
//           Interface_MONEV_Monthly_Realization
//         }
//   ]
// }
