import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname, isAbsolute, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { SqlConnection, SqlStorage } from 'kuiper/storage';
import postgres from 'postgres';

export class PGliteSocketStorage implements SqlStorage {
  readonly driver = 'pglite';
  readonly ephemeral: boolean;
  private address?: string;

  constructor(private readonly dataDir?: string, private readonly socketPath?: string) {
    this.ephemeral = !dataDir;
    if (socketPath && !isAbsolute(socketPath)) throw new Error('PGLITE_SOCKET_PATH must be absolute.');
  }

  get clientOptions(): postgres.Options<Record<string, never>> {
    if (!this.address) throw new Error('The database socket is not listening yet.');
    const options = { username: 'postgres', database: 'postgres', max: 1, prepare: false, fetch_types: false };
    if (this.socketPath) return { ...options, path: this.socketPath };
    return { ...options, host: '127.0.0.1', port: Number(this.address.split(':').at(-1)) };
  }

  async connect(): Promise<SqlConnection> {
    if (this.address) throw new Error('This database already has an open connection.');
    if (this.dataDir) await mkdir(dirname(resolve(this.dataDir)), { recursive: true });
    if (this.socketPath) await prepareSocket(this.socketPath);
    const database = await PGlite.create({ dataDir: this.dataDir, parsers: { 20: (value: string) => value } });
    const server = new PGLiteSocketServer({
      db: database, path: this.socketPath, host: '127.0.0.1', port: 0, maxConnections: 8,
    });
    try {
      await server.start();
      if (this.socketPath) await chmod(this.socketPath, 0o600);
      this.address = server.getServerConn();
    } catch (error) {
      await server.stop();
      await database.close();
      throw error;
    }

    // All clients, including Kuiper, share the wire-protocol queue so transactions stay isolated.
    const client = postgres({ ...this.clientOptions, onnotice: () => {} });
    return {
      drizzle: (schema) => drizzle({ client, schema, casing: 'snake_case' }),
      close: async () => {
        try {
          await client.end({ timeout: 5 });
        } finally {
          try {
            await server.stop();
          } finally {
            this.address = undefined;
            await database.close();
          }
        }
      },
    };
  }
}

async function prepareSocket(path: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!existing) return;
  if (!existing.isSocket()) throw new Error(`Refusing to replace a non-socket file: ${path}`);
  const active = await new Promise<boolean>((resolve, reject) => {
    const socket = createConnection(path);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') resolve(false);
      else reject(error);
    });
  });
  if (active) throw new Error(`A database server is already listening on ${path}`);
  await unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
