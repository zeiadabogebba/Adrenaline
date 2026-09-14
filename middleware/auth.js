const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const protect = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.jwt) {
            token = req.cookies.jwt;
        }

        if (!token) {
            return next(new AppError('You are not logged in. Please log in to access this page.', 401));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const currentUser = await User.findById(decoded.id).select('+password');
        if (!currentUser) {
            return next(new AppError('The user belonging to this token no longer exists.', 401));
        }

        if (currentUser.status === 'suspended') {
            return next(new AppError('Your account has been suspended. Please contact support.', 403));
        }
        if (currentUser.status === 'deactivated') {
            return next(new AppError('This account has been closed. Contact support to reopen it.', 403));
        }

        if (currentUser.changedPasswordAfter(decoded.iat)) {
            return next(new AppError('User recently changed password. Please log in again.', 401));
        }

        req.user = currentUser;
        res.locals.user = currentUser;
        next();
    } catch (err) {
        next(err);
    }
};

const optionalAuth = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.jwt) {
            token = req.cookies.jwt;
        }

        if (!token) return next();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await User.findById(decoded.id);
        if (currentUser && currentUser.status === 'active') {
            req.user = currentUser;
            res.locals.user = currentUser;
        }
        next();
    } catch (err) {
        next();
    }
};

const authorize = (...roles) => (req, res, next) => {
    if (!req.user) return next(new AppError('You are not logged in.', 401));
    if (!roles.includes(req.user.role)) return next(new AppError('You do not have permission to perform this action.', 403));
    next();
};

module.exports = { protect, optionalAuth, authorize };
