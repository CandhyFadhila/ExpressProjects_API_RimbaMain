const knex = require("knex");

const env = (process.env.PG_ENV || "windows").toLowerCase();

const connections = {
  windows: {
    host:"localhost",
    port: 5433,
    user: "postgres",
    password: "super.admin",
    database: "rimba_main",
  },
  linux: {
    host: "localhost",
    port: 5432,
    user: "user_rimba",
    password: "password_kuat",
    database: "db_rimba",
  },
};

const connection = connections[env] || connections.windows;

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
