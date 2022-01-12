// MariaDB Promise
const mariadb = require('mariadb');

// MariaDB CallBack
var mariadb_callback = require('mariadb/callback');

var dbConfig = {
    host : 'localhost',
    user : 'wxrDBadmin',
    password: 'dbpasswd',
    database: 'wxr_server'
};

exports.dbPool = mariadb.createPool(dbConfig);
exports.dbPool_callback = mariadb_callback.createPool(dbConfig);