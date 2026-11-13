export {
  AppError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  ValidationError,
  isAppError,
} from "./internal/errors";
export type { AppErrorInit, AppErrorOptions, ConfigIssue, DependencyName } from "./internal/errors";
export { err, isOk, ok } from "./internal/result";
export type { Result } from "./internal/result";
