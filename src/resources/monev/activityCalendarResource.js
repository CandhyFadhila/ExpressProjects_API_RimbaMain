const knex = require("../../config/database");
const activityCategoryResource = require("../../resources/masterData/activityCategoryResource");
const UserResource = require("../../resources/auth/UserResource");

async function activityCalendarResource(activityCalendar) {
  const [createdUser, category] = await Promise.all([
    activityCalendar.created_by
      ? knex("users").where("id", activityCalendar.created_by).first()
      : null,
    activityCalendar.monev_activity_category_id
      ? knex("monev_activity_categories")
          .where("id", activityCalendar.monev_activity_category_id)
          .first()
      : null,
  ]);

  return {
    id: activityCalendar.id,
    createdUser: createdUser ? await UserResource(createdUser) : null,
    activityCategory: category ? await activityCategoryResource(category) : null,
    name: activityCalendar.name,
    description: activityCalendar.description,
    location: activityCalendar.location,
    startedDate: activityCalendar.started_date,
    finishedDate: activityCalendar.finished_date,
    startedTime: activityCalendar.started_time,
    finishedTime: activityCalendar.finished_time,
    createdAt: activityCalendar.created_at,
    updatedAt: activityCalendar.updated_at,
    deletedAt: activityCalendar.deleted_at,
  };
}

module.exports = activityCalendarResource;
