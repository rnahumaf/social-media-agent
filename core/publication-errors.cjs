// Explicit API rejections can be retried by the user. Transport errors cannot.
const isRejected = error => [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(error?.httpStatus);
function failureStatus(error, submissionAttempted = true) {
  return !submissionAttempted || isRejected(error) ? "failed" : "uncertain";
}
module.exports = { failureStatus };
