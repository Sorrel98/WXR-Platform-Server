var mariadb = require('mariadb/callback');

var dbConfig = {
    host : 'localhost',
    user : 'hyb',
    password: '1234',
    database: 'wxr_server'
};

exports.dbPool = mariadb.createPool(dbConfig);