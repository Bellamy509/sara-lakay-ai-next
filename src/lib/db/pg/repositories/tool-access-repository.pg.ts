import { pgDb as db } from "../db.pg";
import { toolUserAccess } from "../schema.pg";
import { and, eq } from "drizzle-orm";

export interface ToolAccess {
  id: string;
  userId: string;
  toolId: string;
  serverId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolAccessRepository {
  insertAccess(
    access: Omit<ToolAccess, "id" | "createdAt" | "updatedAt">,
  ): Promise<ToolAccess>;
  getAccess(
    userId: string,
    toolId: string,
    serverId: string,
  ): Promise<ToolAccess | null>;
  updateAccess(
    id: string,
    access: Partial<
      Omit<ToolAccess, "id" | "userId" | "createdAt" | "updatedAt">
    >,
  ): Promise<ToolAccess>;
  deleteAccess(id: string): Promise<void>;
  listUserAccess(userId: string): Promise<ToolAccess[]>;
}

class PgToolAccessRepository implements ToolAccessRepository {
  async insertAccess(
    access: Omit<ToolAccess, "id" | "createdAt" | "updatedAt">,
  ): Promise<ToolAccess> {
    const [result] = await db
      .insert(toolUserAccess)
      .values({
        userId: access.userId,
        toolId: access.toolId,
        serverId: access.serverId,
        accessToken: access.accessToken,
        refreshToken: access.refreshToken,
        expiresAt: access.expiresAt,
      })
      .returning();
    return this.mapToToolAccess(result);
  }

  async getAccess(
    userId: string,
    toolId: string,
    serverId: string,
  ): Promise<ToolAccess | null> {
    const result = await db
      .select()
      .from(toolUserAccess)
      .where(
        and(
          eq(toolUserAccess.userId, userId),
          eq(toolUserAccess.toolId, toolId),
          eq(toolUserAccess.serverId, serverId),
        ),
      )
      .limit(1);
    return result[0] ? this.mapToToolAccess(result[0]) : null;
  }

  async updateAccess(
    id: string,
    access: Partial<
      Omit<ToolAccess, "id" | "userId" | "createdAt" | "updatedAt">
    >,
  ): Promise<ToolAccess> {
    const [result] = await db
      .update(toolUserAccess)
      .set({
        toolId: access.toolId,
        serverId: access.serverId,
        accessToken: access.accessToken,
        refreshToken: access.refreshToken,
        expiresAt: access.expiresAt,
      })
      .where(eq(toolUserAccess.id, id))
      .returning();
    return this.mapToToolAccess(result);
  }

  async deleteAccess(id: string): Promise<void> {
    await db.delete(toolUserAccess).where(eq(toolUserAccess.id, id));
  }

  async listUserAccess(userId: string): Promise<ToolAccess[]> {
    const results = await db
      .select()
      .from(toolUserAccess)
      .where(eq(toolUserAccess.userId, userId));
    return results.map(this.mapToToolAccess);
  }

  private mapToToolAccess(row: typeof toolUserAccess.$inferSelect): ToolAccess {
    if (!row.createdAt || !row.updatedAt) {
      throw new Error("Invalid database record: missing required date fields");
    }
    return {
      id: row.id,
      userId: row.userId,
      toolId: row.toolId,
      serverId: row.serverId,
      accessToken: row.accessToken ?? undefined,
      refreshToken: row.refreshToken ?? undefined,
      expiresAt: row.expiresAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const toolAccessRepository = new PgToolAccessRepository();
