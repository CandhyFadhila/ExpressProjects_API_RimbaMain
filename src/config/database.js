const knex = require("knex");

const env = (process.env.PG_ENV || "development").toLowerCase();

const connections = {
  development: {
    host: "localhost",
    port: 5433,
    user: "postgres",
    password: "super.admin",
    database: "rimba_main",
  },
  production: {
    host: "localhost",
    port: 5432,
    user: "user_rimba",
    password: "password_kuat",
    database: "main_rimba",
  },
};

const connection = connections[env] || connections.development;

const db = knex({
  client: "pg",
  connection,
  pool: {
    min: 2,
    max: 50,
  },
  acquireConnectionTimeout: 10000,
});

module.exports = db;
