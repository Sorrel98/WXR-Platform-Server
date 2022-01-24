
// DBError class
// When there is no error in MariaDB API but, try to deal with improper data in Nodejs,
// Create DBError.
class DBError extends Error {
    constructor(message, statusCode){
        super(message);
        this.statusCode = statusCode;
    }
}

class BadRequestError extends Error {
    constructor(message){
        super(message);
        this.statusCode = 400;
    }
}

class UnauthorizedError extends Error {
    constructor(message){
        super(message);
        this.statusCode = 401;
    }
}

module.exports = { DBError, BadRequestError, UnauthorizedError }