const mariadb = require('mariadb');

const dbConfig = {
    host: 'localhost',
    user: 'wxrDBadmin',
    password: 'dbpasswd',
    database: 'wxr_server'
};

exports.dbPool = mariadb.createPool(dbConfig);