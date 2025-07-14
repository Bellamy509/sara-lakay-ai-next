import { pgDb as db } from "../db.pg";
import { userConnection } from "../schema.pg";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";

export interface UserConnection {
  id: string;
  userId: string;
  connectionToken: string;
  toolAccessId?: string;
  lastActivity: Date;
  createdAt: Date;
  deviceInfo: Record<string, any>;
  isActive: boolean;
}

export interface UserConnectionRepository {
  createConnection(
    connection: Omit<
      UserConnection,
      "id" | "connectionToken" | "createdAt" | "lastActivity"
    >,
  ): Promise<UserConnection>;
  getActiveConnection(
    userId: string,
    toolAccessId?: string,
  ): Promise<UserConnection | null>;
  updateLastActivity(id: string): Promise<void>;
  deactivateConnection(id: string): Promise<void>;
  cleanupInactiveConnections(): Promise<void>;
}

class PgUserConnectionRepository implements UserConnectionRepository {
  private mapToUserConnection(
    row: typeof userConnection.$inferSelect,
  ): UserConnection {
    if (!row.lastActivity || !row.createdAt) {
      throw new Error("Invalid database record: missing required date fields");
    }
    return {
      id: row.id,
      userId: row.userId,
      connectionToken: row.connectionToken,
      toolAccessId: row.toolAccessId ?? undefined,
      lastActivity: row.lastActivity,
      createdAt: row.createdAt,
      deviceInfo: row.deviceInfo ?? {},
      isActive: row.isActive ?? false,
    };
  }

  async createConnection(
    connection: Omit<
      UserConnection,
      "id" | "connectionToken" | "createdAt" | "lastActivity"
    >,
  ): Promise<UserConnection> {
    const [result] = await db
      .insert(userConnection)
      .values({
        ...connection,
        connectionToken: `conn_${randomUUID()}`,
      })
      .returning();
    return this.mapToUserConnection(result);
  }

  async getActiveConnection(
    userId: string,
    toolAccessId?: string,
  ): Promise<UserConnection | null> {
    const conditions = [
      eq(userConnection.userId, userId),
      eq(userConnection.isActive, true),
    ];

    if (toolAccessId) {
      conditions.push(eq(userConnection.toolAccessId, toolAccessId));
    }

    const [result] = await db
      .select()
      .from(userConnection)
      .where(and(...conditions))
      .limit(1);

    return result ? this.mapToUserConnection(result) : null;
  }

  async updateLastActivity(id: string): Promise<void> {
    await db
      .update(userConnection)
      .set({ lastActivity: new Date() })
      .where(eq(userConnection.id, id));
  }

  async deactivateConnection(id: string): Promise<void> {
    await db
      .update(userConnection)
      .set({ isActive: false })
      .where(eq(userConnection.id, id));
  }

  async cleanupInactiveConnections(): Promise<void> {
    await db.execute(sql`SELECT cleanup_inactive_connections()`);
  }
}

export const userConnectionRepository = new PgUserConnectionRepository();
