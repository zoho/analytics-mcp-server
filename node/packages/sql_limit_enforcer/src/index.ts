/**
 * sql-limit-enforcer
 * ~~~~~~~~~~~~~~~~~~
 *
 * A lightweight, zero-dependency library for enforcing an upper LIMIT on
 * MySQL-compatible SELECT queries.
 */

export { enforceLimit } from "./enforcer";
export type { Token } from "./enforcer";
export { TokenType } from "./enforcer";
