// Server error class definitions

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

module.exports = { BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, InternalServerError }