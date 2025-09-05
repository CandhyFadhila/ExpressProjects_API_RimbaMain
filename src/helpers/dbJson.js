const knex = require("../config/database");

function asJsonb(val) {
  return knex.raw("?::jsonb", [JSON.stringify(val)]);
}
module.exports = { asJsonb };
