const {
  resolveArrayRelations,
} = require("../../helpers/resolveArrayRelations");
const newsCategoryResource = require("../masterData/newsCategoryResource");
const knex = require("../../config/database");
const documentResource = require("../../resources/doc/documentResource");

async function newsResource(news) {
  const category = news.cms_news_category_id
    ? await knex("cms_news_categories").where("id", news.cms_news_category_id).first()
    : null;

  const thumbnail = await resolveArrayRelations(
    news.thumbnail_ids,
    "documents",
    documentResource
  );

  return {
    id: news.id,
    newsCategory: category ? await newsCategoryResource(category) : null,
    thumbnail: thumbnail,
    title: news.title,
    slug: news.slug,
    description: news.description,
    newsContent: news.news_content,
    createdAt: news.created_at,
    updatedAt: news.updated_at,
    deletedAt: news.deleted_at,
  };
}

module.exports = newsResource;
