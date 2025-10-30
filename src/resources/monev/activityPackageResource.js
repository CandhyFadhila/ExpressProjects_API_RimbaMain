const knex = require("../../config/database");
const { orderByYearMonth } = require("../../helpers/orderByYearMonth");
const picDivisionResource = require("../masterData/picDivisionResource");
const UserResource = require("../auth/UserResource");
const targetResource = require("./targetResource");
const monthlyRealizationResource = require("./monthlyRealizationResource");

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

  const { sql, bindings } = orderByYearMonth(
    "year",
    "month_index",
    "asc",
    "asc"
  );

  const [
    originalTargets,
    pendingTargets,
    originalMonthRealizations,
    pendingMonthRealizations,
  ] = await Promise.all([
    knex("monev_targets")
      .where("monev_activity_packages_id", activity.id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings),
    knex("monev_target_pending_updates")
      .where("monev_activity_packages_id", activity.id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings),
    knex("monev_monthly_realizations")
      .where("monev_activity_packages_id", activity.id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings),
    knex("monev_monthly_realization_pending_updates")
      .where("monev_activity_packages_id", activity.id)
      .whereNull("deleted_at")
      .orderByRaw(sql, bindings),
  ]);

  const monevTargetOriginal = await Promise.all(
    originalTargets.map((row) =>
      targetResource(row, { activityPackage: activity })
    )
  );
  const monevTargetPendingUpdate = await Promise.all(
    pendingTargets.map((row) =>
      targetResource(row, { activityPackage: activity })
    )
  );

  const monevMonthlyRealizationOriginal = await Promise.all(
    originalMonthRealizations.map((row) =>
      monthlyRealizationResource(row, { activityPackage: activity })
    )
  );
  const monevMonthlyRealizationPendingUpdate = await Promise.all(
    pendingMonthRealizations.map((row) =>
      monthlyRealizationResource(row, { activityPackage: activity })
    )
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
    startedYear: activity.started_year,
    finishedYear: activity.finished_year,
    unitOutput: activity.unit_output,
    codeOutput: activity.code_output,
    volume: activity.volume,
    pagu: activity.pagu,
    partner: activity.partner,
    target: {
      monevTargetOriginal,
      monevTargetPendingUpdate,
    },
    monthlyRealization: {
      monevMonthlyRealizationOriginal,
      monevMonthlyRealizationPendingUpdate,
    },
    createdAt: activity.created_at,
    updatedAt: activity.updated_at,
    deletedAt: activity.deleted_at,
  };
}

module.exports = activityPackageResource;
