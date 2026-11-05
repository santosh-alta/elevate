export class HttpError extends Error {
  constructor(public statusCode: number, public error: string, message: string) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, "bad_request", message);
export const unauthorized = (message = "Sign in required") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have permission to do this") => new HttpError(403, "forbidden", message);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
