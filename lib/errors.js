
// DBError class
// When there is no error in MariaDB API but, try to deal with improper data in Nodejs,
// Create DBError.
class DBError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

class BadRequestError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 400;
    }
}

class UnauthorizedError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 401;
    }
}

class ForbiddenError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 403;
    }
}

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 404;
    }
}

class InternalServerError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 500;
    }
}

module.exports = { DBError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, InternalServerError }