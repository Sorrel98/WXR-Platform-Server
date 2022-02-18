const mariadb = require('mariadb');

const dbConfig = {
    host: 'localhost',
    user: 'wxrDBadmin',
    password: 'dbpasswd',
    database: 'wxr_server',
    timezone: 'Etc/UTC',
};

exports.dbPool = mariadb.createPool(dbConfig);