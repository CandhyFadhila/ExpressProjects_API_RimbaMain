const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const documentResource = require("../../resources/doc/documentResource");

async function monevDashboardResource(dashboard) {
  const frameworkFiles = await resolveArrayRelations(
    dashboard.framework_file_ids,
    "documents",
    documentResource
  );

  const planFiles = await resolveArrayRelations(
    dashboard.plan_file_ids,
    "documents",
    documentResource
  );

  return {
    id: dashboard.id,
    frameworkFiles: frameworkFiles,
    planFiles: planFiles,
    description: dashboard.description,
    networthHibah: dashboard.networth_hibah,
    createdAt: dashboard.created_at,
    updatedAt: dashboard.updated_at,
    deletedAt: dashboard.deleted_at,
  };
}

module.exports = monevDashboardResource;
