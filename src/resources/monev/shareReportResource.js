const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const knex = require("../../config/database");
const documentResource = require("../../resources/doc/documentResource");
const UserResource = require("../../resources/auth/UserResource");

async function shareReportResource(report) {
  const user = report.created_by
    ? await knex("users").where("id", report.created_by).first()
    : null;

  const file = await resolveArrayRelations(
    report.report_file_ids,
    "documents",
    documentResource
  );

  return {
    id: report.id,
    createdUser: user ? await UserResource(user) : null,
    report: file,
    name: report.name,
    description: report.description,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    deletedAt: report.deleted_at,
  };
}

module.exports = shareReportResource;
