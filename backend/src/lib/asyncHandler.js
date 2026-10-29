/**
 * Wrap an async Express handler so a rejected promise is forwarded to the
 * central error handler instead of becoming an unhandled rejection (which, in
 * Express 4, leaves the request hanging and can crash the process).
 */
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
