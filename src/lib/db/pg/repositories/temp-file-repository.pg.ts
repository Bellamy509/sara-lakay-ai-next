import { TempFileSchema, TempFileEntity } from "../schema.pg";
import { pgDb } from "../db.pg";
import { eq, and, lt } from "drizzle-orm";
import { unlink } from "fs/promises";

export interface TempFileData {
  id: string;
  filename: string;
  filePath: string;
  expiresAt: Date;
  userId: string;
}

export class TempFileRepository {
  async createTempFile(data: TempFileData): Promise<TempFileEntity> {
    const [result] = await pgDb
      .insert(TempFileSchema)
      .values({
        id: data.id,
        filename: data.filename,
        filePath: data.filePath,
        expiresAt: data.expiresAt,
        userId: data.userId,
      })
      .returning();

    console.log(`Created temp file in DB: ${data.id}`);
    return result;
  }

  async getTempFile(
    id: string,
    userId: string,
  ): Promise<TempFileEntity | null> {
    const [result] = await pgDb
      .select()
      .from(TempFileSchema)
      .where(and(eq(TempFileSchema.id, id), eq(TempFileSchema.userId, userId)))
      .limit(1);

    console.log(
      `Retrieved temp file from DB: ${id} for user ${userId} - ${result ? "Found" : "Not found"}`,
    );
    return result || null;
  }

  async deleteTempFile(id: string): Promise<void> {
    await pgDb.delete(TempFileSchema).where(eq(TempFileSchema.id, id));

    console.log(`Deleted temp file from DB: ${id}`);
  }

  async cleanupExpiredFiles(): Promise<number> {
    const now = new Date();

    // Get expired files first to delete physical files
    const expiredFiles = await pgDb
      .select()
      .from(TempFileSchema)
      .where(lt(TempFileSchema.expiresAt, now));

    // Delete physical files
    for (const file of expiredFiles) {
      try {
        await unlink(file.filePath);
        console.log(`Deleted expired physical file: ${file.filePath}`);
      } catch (error) {
        console.error(
          `Failed to delete physical file ${file.filePath}:`,
          error,
        );
      }
    }

    // Delete database records
    await pgDb.delete(TempFileSchema).where(lt(TempFileSchema.expiresAt, now));

    console.log(`Cleaned up ${expiredFiles.length} expired temp files`);
    return expiredFiles.length;
  }

  async getAllTempFiles(): Promise<TempFileEntity[]> {
    return await pgDb.select().from(TempFileSchema);
  }

  async isFileExpired(id: string): Promise<boolean> {
    const file = await this.getTempFile(id, "");
    if (!file) return true;

    return new Date() > file.expiresAt;
  }
}

export const tempFileRepository = new TempFileRepository();
