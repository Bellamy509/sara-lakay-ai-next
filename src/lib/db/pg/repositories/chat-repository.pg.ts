import {
  ChatMessage,
  ChatRepository,
  ChatThread,
  ChatThreadWithAccess,
  ThreadAccess,
  Project,
  EncryptedChatMessage,
} from "app-types/chat";

import { pgDb as db } from "../db.pg";
import {
  ChatMessageSchema,
  ChatThreadSchema,
  ProjectSchema,
  UserSchema,
  ChatThreadAccessSchema,
  EncryptedChatMessageSchema,
} from "../schema.pg";

import { and, desc, eq, gte, isNull, sql, or, exists, asc } from "drizzle-orm";
import { pgUserRepository } from "./user-repository.pg";
import { UserPreferences } from "app-types/user";
import logger from "logger";

// Helper function to check thread access
const hasThreadAccess = async (
  threadId: string,
  userId: string,
): Promise<boolean> => {
  const [access] = await db
    .select()
    .from(ChatThreadSchema)
    .leftJoin(
      ChatThreadAccessSchema,
      and(
        eq(ChatThreadSchema.id, threadId),
        eq(ChatThreadAccessSchema.userId, userId),
      ),
    )
    .where(
      or(
        eq(ChatThreadSchema.userId, userId),
        and(
          eq(ChatThreadAccessSchema.userId, userId),
          eq(ChatThreadAccessSchema.threadId, threadId),
        ),
      ),
    )
    .limit(1);

  return !!access;
};

// Helper function to check if user owns thread
const isThreadOwner = async (
  threadId: string,
  userId: string,
): Promise<boolean> => {
  const [thread] = await db
    .select()
    .from(ChatThreadSchema)
    .where(
      and(
        eq(ChatThreadSchema.id, threadId),
        eq(ChatThreadSchema.userId, userId),
      ),
    )
    .limit(1);

  return !!thread;
};

export const pgChatRepository: ChatRepository = {
  insertThread: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<ChatThread> => {
    const [result] = await db
      .insert(ChatThreadSchema)
      .values({
        title: thread.title,
        userId: thread.userId,
        projectId: thread.projectId,
        id: thread.id,
      })
      .returning();
    return result;
  },

  deleteChatMessage: async (id: string): Promise<void> => {
    await db.delete(ChatMessageSchema).where(eq(ChatMessageSchema.id, id));
  },

  selectThread: async (
    id: string,
    userId: string,
  ): Promise<ChatThread | null> => {
    try {
      const [thread] = await db
        .select({
          thread: ChatThreadSchema,
          access: ChatThreadAccessSchema,
        })
        .from(ChatThreadSchema)
        .leftJoin(
          ChatThreadAccessSchema,
          and(
            eq(ChatThreadSchema.id, ChatThreadAccessSchema.threadId),
            eq(ChatThreadAccessSchema.userId, userId),
          ),
        )
        .where(
          and(
            eq(ChatThreadSchema.id, id),
            or(
              eq(ChatThreadSchema.userId, userId),
              eq(ChatThreadAccessSchema.userId, userId),
            ),
          ),
        )
        .limit(1);

      return thread ? thread.thread : null;
    } catch (error) {
      logger.error("Error selecting thread:", error);
      return null;
    }
  },

  selectThreadDetails: async (id: string) => {
    if (!id) {
      return null;
    }
    const [thread] = await db
      .select()
      .from(ChatThreadSchema)
      .leftJoin(ProjectSchema, eq(ChatThreadSchema.projectId, ProjectSchema.id))
      .leftJoin(UserSchema, eq(ChatThreadSchema.userId, UserSchema.id))
      .where(eq(ChatThreadSchema.id, id));

    if (!thread) {
      return null;
    }

    const messages = await pgChatRepository.selectMessagesByThreadId(
      id,
      thread.chat_thread.userId,
    );
    return {
      id: thread.chat_thread.id,
      title: thread.chat_thread.title,
      userId: thread.chat_thread.userId,
      createdAt: thread.chat_thread.createdAt,
      projectId: thread.chat_thread.projectId,
      instructions: thread.project?.instructions ?? null,
      userPreferences: thread.user?.preferences ?? undefined,
      messages,
    };
  },

  selectThreadInstructionsByProjectId: async (userId, projectId) => {
    const result = {
      instructions: null as Project["instructions"] | null,
      userPreferences: undefined as UserPreferences | undefined,
    };

    const user = await pgUserRepository.findById(userId);

    if (!user) throw new Error("User not found");

    result.userPreferences = user.preferences;

    if (projectId) {
      const [project] = await db
        .select()
        .from(ProjectSchema)
        .where(eq(ProjectSchema.id, projectId));

      if (project) {
        result.instructions = project.instructions;
      }
    }

    return result;
  },

  selectThreadInstructions: async (userId, threadId) => {
    const result = {
      instructions: null as Project["instructions"] | null,
      userPreferences: undefined as UserPreferences | undefined,
      threadId: undefined as string | undefined,
      projectId: undefined as string | undefined,
    };

    const user = await pgUserRepository.findById(userId);

    if (!user) throw new Error("User not found");

    result.userPreferences = user.preferences;

    if (threadId) {
      const [thread] = await db
        .select({
          threadId: ChatThreadSchema.id,
          projectId: ChatThreadSchema.projectId,
          instructions: ProjectSchema.instructions,
        })
        .from(ChatThreadSchema)
        .leftJoin(
          ProjectSchema,
          eq(ChatThreadSchema.projectId, ProjectSchema.id),
        )
        .where(eq(ChatThreadSchema.id, threadId));
      if (thread) {
        result.instructions = thread.instructions;
        result.projectId = thread.projectId ?? undefined;
        result.threadId = thread.threadId;
      }
    }
    return result;
  },

  selectMessagesByThreadId: async (
    threadId: string,
    userId: string,
  ): Promise<ChatMessage[]> => {
    try {
      const result = await db
        .select()
        .from(ChatMessageSchema)
        .where(
          and(
            eq(ChatMessageSchema.threadId, threadId),
            exists(
              db
                .select()
                .from(ChatThreadSchema)
                .leftJoin(
                  ChatThreadAccessSchema,
                  eq(ChatThreadSchema.id, ChatThreadAccessSchema.threadId),
                )
                .where(
                  and(
                    eq(ChatThreadSchema.id, threadId),
                    or(
                      eq(ChatThreadSchema.userId, userId),
                      eq(ChatThreadAccessSchema.userId, userId),
                    ),
                  ),
                ),
            ),
          ),
        )
        .orderBy(ChatMessageSchema.createdAt);
      return result as ChatMessage[];
    } catch (error) {
      logger.error("Error selecting messages by thread ID:", error);
      return [];
    }
  },

  selectThreadsByUserId: async (
    userId: string,
  ): Promise<(ChatThreadWithAccess & { lastMessageAt: number })[]> => {
    try {
      const threadWithLatestMessage = await db
        .select({
          threadId: ChatThreadSchema.id,
          title: ChatThreadSchema.title,
          createdAt: ChatThreadSchema.createdAt,
          userId: ChatThreadSchema.userId,
          projectId: ChatThreadSchema.projectId,
          accessType: ChatThreadAccessSchema.accessType,
          lastMessageAt: sql<string>`MAX(${ChatMessageSchema.createdAt})`.as(
            "last_message_at",
          ),
        })
        .from(ChatThreadSchema)
        .leftJoin(
          ChatMessageSchema,
          eq(ChatThreadSchema.id, ChatMessageSchema.threadId),
        )
        .leftJoin(
          ChatThreadAccessSchema,
          and(
            eq(ChatThreadSchema.id, ChatThreadAccessSchema.threadId),
            eq(ChatThreadAccessSchema.userId, userId),
          ),
        )
        .where(
          or(
            eq(ChatThreadSchema.userId, userId),
            eq(ChatThreadAccessSchema.userId, userId),
          ),
        )
        .groupBy(
          ChatThreadSchema.id,
          ChatThreadSchema.title,
          ChatThreadSchema.createdAt,
          ChatThreadSchema.userId,
          ChatThreadSchema.projectId,
          ChatThreadAccessSchema.accessType,
        )
        .orderBy(desc(sql`last_message_at`));

      return threadWithLatestMessage.map((row) => ({
        id: row.threadId,
        title: row.title,
        userId: row.userId,
        projectId: row.projectId,
        createdAt: row.createdAt,
        lastMessageAt: row.lastMessageAt
          ? new Date(row.lastMessageAt).getTime()
          : 0,
        accessType:
          row.userId === userId
            ? "owner"
            : (row.accessType as "viewer" | "editor" | undefined),
      }));
    } catch (error) {
      logger.error("Error selecting threads by user ID:", error);
      return [];
    }
  },

  updateThread: async (
    id: string,
    thread: Partial<Omit<ChatThread, "id" | "createdAt">>,
  ): Promise<ChatThread> => {
    const [result] = await db
      .update(ChatThreadSchema)
      .set({
        projectId: thread.projectId,
        title: thread.title,
      })
      .where(eq(ChatThreadSchema.id, id))
      .returning();
    return result;
  },

  deleteThread: async (id: string): Promise<void> => {
    try {
      await db
        .delete(ChatMessageSchema)
        .where(eq(ChatMessageSchema.threadId, id));

      await db.delete(ChatThreadSchema).where(eq(ChatThreadSchema.id, id));
    } catch (error) {
      logger.error("Error deleting thread:", error);
    }
  },

  insertMessage: async (
    message: Omit<ChatMessage, "createdAt">,
  ): Promise<ChatMessage> => {
    // Check access before inserting
    const hasAccess = await hasThreadAccess(message.threadId, message.userId);
    if (!hasAccess) {
      throw new Error("Unauthorized: No access to this thread");
    }

    const entity = {
      ...message,
      id: message.id,
    };
    const [result] = await db
      .insert(ChatMessageSchema)
      .values(entity)
      .returning();
    return result as ChatMessage;
  },

  upsertMessage: async (
    message: Omit<ChatMessage, "createdAt">,
  ): Promise<ChatMessage> => {
    const result = await db
      .insert(ChatMessageSchema)
      .values(message)
      .onConflictDoUpdate({
        target: [ChatMessageSchema.id],
        set: {
          parts: message.parts,
          annotations: message.annotations,
          attachments: message.attachments,
          model: message.model,
        },
      })
      .returning();
    return result[0] as ChatMessage;
  },

  deleteMessagesByChatIdAfterTimestamp: async (
    messageId: string,
  ): Promise<void> => {
    try {
      const [message] = await db
        .select()
        .from(ChatMessageSchema)
        .where(eq(ChatMessageSchema.id, messageId));
      if (!message) {
        return;
      }
      // Delete messages that are in the same thread AND created before or at the same time as the target message
      await db
        .delete(ChatMessageSchema)
        .where(
          and(
            eq(ChatMessageSchema.threadId, message.threadId),
            gte(ChatMessageSchema.createdAt, message.createdAt),
          ),
        );
    } catch (error) {
      logger.error(
        "Error deleting messages by chat ID after timestamp:",
        error,
      );
    }
  },

  deleteNonProjectThreads: async (userId: string): Promise<void> => {
    try {
      const threadIds = await db
        .select({ id: ChatThreadSchema.id })
        .from(ChatThreadSchema)
        .where(
          and(
            eq(ChatThreadSchema.userId, userId),
            isNull(ChatThreadSchema.projectId),
          ),
        );
      await Promise.all(
        threadIds.map((threadId) => pgChatRepository.deleteThread(threadId.id)),
      );
    } catch (error) {
      logger.error("Error deleting non-project threads:", error);
    }
  },

  deleteAllThreads: async (userId: string): Promise<void> => {
    try {
      const threadIds = await db
        .select({ id: ChatThreadSchema.id })
        .from(ChatThreadSchema)
        .where(eq(ChatThreadSchema.userId, userId));
      await Promise.all(
        threadIds.map((threadId) => pgChatRepository.deleteThread(threadId.id)),
      );
    } catch (error) {
      logger.error("Error deleting all threads:", error);
    }
  },

  insertProject: async (
    project: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ): Promise<Project> => {
    const result = await db
      .insert(ProjectSchema)
      .values({
        ...project,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return result[0] as Project;
  },

  selectProjectById: async (
    id: string,
  ): Promise<
    | (Project & {
        threads: ChatThread[];
      })
    | null
  > => {
    const result = await db
      .select({
        project: ProjectSchema,
        thread: ChatThreadSchema,
      })
      .from(ProjectSchema)
      .where(eq(ProjectSchema.id, id))
      .leftJoin(
        ChatThreadSchema,
        eq(ProjectSchema.id, ChatThreadSchema.projectId),
      );
    const project = result[0] ? result[0].project : null;
    const threads = result.map((row) => row.thread!).filter(Boolean);
    if (!project) {
      return null;
    }
    return { ...(project as Project), threads };
  },

  selectProjectsByUserId: async (
    userId: string,
  ): Promise<Omit<Project, "instructions">[]> => {
    const result = await db
      .select({
        id: ProjectSchema.id,
        name: ProjectSchema.name,
        createdAt: ProjectSchema.createdAt,
        updatedAt: ProjectSchema.updatedAt,
        userId: ProjectSchema.userId,
        lastThreadAt:
          sql<string>`COALESCE(MAX(${ChatThreadSchema.createdAt}), '1970-01-01')`.as(
            `last_thread_at`,
          ),
      })
      .from(ProjectSchema)
      .leftJoin(
        ChatThreadSchema,
        eq(ProjectSchema.id, ChatThreadSchema.projectId),
      )
      .where(eq(ProjectSchema.userId, userId))
      .groupBy(ProjectSchema.id)
      .orderBy(desc(sql`last_thread_at`), desc(ProjectSchema.createdAt));
    return result;
  },

  updateProject: async (
    id: string,
    project: Partial<Pick<Project, "name" | "instructions">>,
  ): Promise<Project> => {
    const [result] = await db
      .update(ProjectSchema)
      .set(project)
      .where(eq(ProjectSchema.id, id))
      .returning();
    return result as Project;
  },

  deleteProject: async (id: string): Promise<void> => {
    try {
      const threadIds = await db
        .select({ id: ChatThreadSchema.id })
        .from(ChatThreadSchema)
        .where(eq(ChatThreadSchema.projectId, id));
      await Promise.all(
        threadIds.map((threadId) => pgChatRepository.deleteThread(threadId.id)),
      );

      await db.delete(ProjectSchema).where(eq(ProjectSchema.id, id));
    } catch (error) {
      logger.error("Error deleting project:", error);
    }
  },

  insertMessages: async (
    messages: PartialBy<ChatMessage, "createdAt">[],
  ): Promise<ChatMessage[]> => {
    const result = await db
      .insert(ChatMessageSchema)
      .values(messages)
      .returning();
    return result as ChatMessage[];
  },

  // Add new methods for thread access management
  grantThreadAccess: async (
    access: ThreadAccess & { grantedBy: string },
  ): Promise<void> => {
    // Check if granter owns the thread
    const isOwner = await isThreadOwner(access.threadId, access.grantedBy);
    if (!isOwner) {
      throw new Error("Unauthorized: Only thread owner can grant access");
    }

    try {
      await db.insert(ChatThreadAccessSchema).values({
        threadId: access.threadId,
        userId: access.userId,
        accessType: access.accessType,
        createdBy: access.grantedBy,
      });
    } catch (error) {
      logger.error("Error granting thread access:", error);
      throw error;
    }
  },

  revokeThreadAccess: async (
    threadId: string,
    userId: string,
    revokedBy: string,
  ): Promise<void> => {
    // Check if revoker owns the thread
    const isOwner = await isThreadOwner(threadId, revokedBy);
    if (!isOwner) {
      throw new Error("Unauthorized: Only thread owner can revoke access");
    }

    try {
      await db
        .delete(ChatThreadAccessSchema)
        .where(
          and(
            eq(ChatThreadAccessSchema.threadId, threadId),
            eq(ChatThreadAccessSchema.userId, userId),
          ),
        );
    } catch (error) {
      logger.error("Error revoking thread access:", error);
      throw error;
    }
  },

  selectThreadAccess: async (
    threadId: string,
    userId: string,
  ): Promise<ThreadAccess | null> => {
    try {
      const [access] = await db
        .select()
        .from(ChatThreadAccessSchema)
        .where(
          and(
            eq(ChatThreadAccessSchema.threadId, threadId),
            eq(ChatThreadAccessSchema.userId, userId),
          ),
        )
        .limit(1);

      return access
        ? {
            threadId: access.threadId,
            userId: access.userId,
            accessType: access.accessType,
          }
        : null;
    } catch (error) {
      logger.error("Error selecting thread access:", error);
      return null;
    }
  },

  insertEncryptedMessage: async (
    message: Omit<EncryptedChatMessage, "createdAt">,
    userId: string,
  ): Promise<EncryptedChatMessage> => {
    // Check access before inserting
    const hasAccess = await hasThreadAccess(message.threadId, userId);
    if (!hasAccess) {
      throw new Error("Unauthorized: No access to this thread");
    }

    const [result] = await db
      .insert(EncryptedChatMessageSchema)
      .values({
        id: message.id,
        threadId: message.threadId,
        encryptedContent: message.encryptedContent.toString("base64"),
        iv: message.iv.toString("base64"),
      })
      .returning();

    return {
      id: result.id,
      threadId: result.threadId,
      encryptedContent: Buffer.from(result.encryptedContent, "base64"),
      iv: Buffer.from(result.iv, "base64"),
      createdAt: result.createdAt,
    };
  },

  selectEncryptedMessage: async (
    id: string,
    userId: string,
  ): Promise<EncryptedChatMessage | null> => {
    const [result] = await db
      .select()
      .from(EncryptedChatMessageSchema)
      .where(
        and(
          eq(EncryptedChatMessageSchema.id, id),
          exists(
            db
              .select()
              .from(ChatThreadSchema)
              .leftJoin(
                ChatThreadAccessSchema,
                eq(ChatThreadSchema.id, ChatThreadAccessSchema.threadId),
              )
              .where(
                and(
                  eq(ChatThreadSchema.id, EncryptedChatMessageSchema.threadId),
                  or(
                    eq(ChatThreadSchema.userId, userId),
                    and(
                      eq(ChatThreadAccessSchema.userId, userId),
                      eq(ChatThreadAccessSchema.accessType, "editor"),
                    ),
                  ),
                ),
              ),
          ),
        ),
      )
      .limit(1);

    if (!result) return null;

    return {
      id: result.id,
      threadId: result.threadId,
      encryptedContent: Buffer.from(result.encryptedContent, "base64"),
      iv: Buffer.from(result.iv, "base64"),
      createdAt: result.createdAt,
    };
  },

  selectEncryptedMessagesByThreadId: async (
    threadId: string,
    userId: string,
  ): Promise<EncryptedChatMessage[]> => {
    const results = await db
      .select()
      .from(EncryptedChatMessageSchema)
      .where(
        and(
          eq(EncryptedChatMessageSchema.threadId, threadId),
          or(
            eq(ChatThreadSchema.userId, userId),
            exists(
              db
                .select()
                .from(ChatThreadAccessSchema)
                .where(
                  and(
                    eq(ChatThreadAccessSchema.threadId, threadId),
                    eq(ChatThreadAccessSchema.userId, userId),
                  ),
                ),
            ),
          ),
        ),
      )
      .orderBy(asc(EncryptedChatMessageSchema.createdAt));

    return results.map((result) => ({
      id: result.id,
      threadId: result.threadId,
      encryptedContent: Buffer.from(result.encryptedContent, "base64"),
      iv: Buffer.from(result.iv, "base64"),
      createdAt: result.createdAt,
    }));
  },
};
