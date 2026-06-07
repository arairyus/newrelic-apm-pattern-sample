declare module "pg" {
  export type PoolConfig = {
    connectionString?: string;
  };

  export class Pool {
    constructor(config?: PoolConfig);
    query(
      sql: string,
      values?: unknown[],
    ): Promise<{
      rows: Record<string, unknown>[];
    }>;
    end(): Promise<void>;
  }
}
