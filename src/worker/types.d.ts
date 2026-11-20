// Just enough of the Cloudflare D1 surface for typechecking without pulling in
// all of @cloudflare/workers-types (which collides with the DOM lib the client
// uses in the same tsconfig).

interface D1Result<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: { changes?: number; last_row_id?: number; duration?: number }
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<{ count: number; duration: number }>
}
