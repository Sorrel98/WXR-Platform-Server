// MariaDB Promise
const mariadb = require('mariadb');

// MariaDB CallBack
var mariadb_callback = require('mariadb/callback');

var dbConfig = {
    host : 'localhost',
    user : 'hyb',
    password: '1234',
    database: 'wxr_server'
};

exports.dbPool = mariadb.createPool(dbConfig);
exports.dbPool_callback = mariadb_callback.createPool(dbConfig);