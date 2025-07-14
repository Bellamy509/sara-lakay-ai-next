import type { UIMessage, Message } from "ai";
import { z } from "zod";
import { AllowedMCPServerZodSchema } from "./mcp";
import { UserPreferences } from "./user";

export type ChatModel = {
  provider: string;
  model: string;
};

export interface ChatThread {
  id: string;
  title: string;
  userId: string;
  projectId: string | null;
  createdAt: Date;
}

export interface ChatThreadWithAccess extends ChatThread {
  accessType?: "owner" | "viewer" | "editor";
}

export interface ThreadAccess {
  threadId: string;
  userId: string;
  accessType: "owner" | "viewer" | "editor";
}

export interface ChatThreadDetails extends ChatThread {
  instructions: Project["instructions"] | null;
  messages: ChatMessage[];
  userPreferences?: UserPreferences;
}

export type Project = {
  id: string;
  name: string;
  userId: string;
  instructions: {
    systemPrompt: string;
  };
  createdAt: Date;
  updatedAt: Date;
};

export interface MessagePart {
  text?: string;
  image_url?: string;
  file_url?: string;
}

export interface Attachment {
  type: string;
  content: unknown;
}

export interface Annotation {
  type: string;
  text: string;
  attributes?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system" | "tool" | "function";
  parts: MessagePart[];
  attachments?: Attachment[];
  annotations?: Annotation[];
  model?: string;
  createdAt: Date;
  userId: string; // Add userId to track message creator
}

export type ChatMention =
  | {
      type: "tool";
      name: string;
      serverName?: string;
      serverId: string;
    }
  | {
      type: "mcpServer";
      name: string;
      serverId: string;
    }
  | {
      type: "unknown";
      name: string;
    };

export type ChatMessageAnnotation = {
  mentions?: ChatMention[];
  usageTokens?: number;
  toolChoice?: "auto" | "none" | "manual";
  [key: string]: any;
};

export enum AppDefaultToolkit {
  Visualization = "visualization",
}

export const chatApiSchemaRequestBodySchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  message: z.any() as z.ZodType<UIMessage>,
  chatModel: z
    .object({
      provider: z.string(),
      model: z.string(),
    })
    .optional(),
  toolChoice: z.enum(["auto", "none", "manual"]),
  allowedMcpServers: z.record(z.string(), AllowedMCPServerZodSchema).optional(),
  allowedAppDefaultToolkit: z.array(z.string()).optional(),
});

export type ChatApiSchemaRequestBody = z.infer<
  typeof chatApiSchemaRequestBodySchema
>;

export type ToolInvocationUIPart = Extract<
  Exclude<Message["parts"], undefined>[number],
  { type: "tool-invocation" }
>;

export interface ChatRepository {
  insertThread(thread: Omit<ChatThread, "createdAt">): Promise<ChatThread>;
  selectThread(id: string, userId: string): Promise<ChatThread | null>;
  selectThreadDetails(id: string): Promise<ChatThreadDetails | null>;
  selectThreadsByUserId(
    userId: string,
  ): Promise<(ChatThreadWithAccess & { lastMessageAt: number })[]>;
  updateThread(
    id: string,
    thread: Partial<Omit<ChatThread, "id" | "createdAt">>,
  ): Promise<ChatThread>;
  deleteThread(id: string): Promise<void>;
  insertMessage(message: Omit<ChatMessage, "createdAt">): Promise<ChatMessage>;
  selectMessagesByThreadId(
    threadId: string,
    userId: string,
  ): Promise<ChatMessage[]>;
  upsertMessage(message: Omit<ChatMessage, "createdAt">): Promise<ChatMessage>;
  deleteMessagesByChatIdAfterTimestamp(messageId: string): Promise<void>;
  deleteNonProjectThreads(userId: string): Promise<void>;
  deleteAllThreads(userId: string): Promise<void>;
  insertProject(
    project: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ): Promise<Project>;
  selectProjectById(
    id: string,
  ): Promise<(Project & { threads: ChatThread[] }) | null>;
  selectProjectsByUserId(
    userId: string,
  ): Promise<Omit<Project, "instructions">[]>;
  updateProject(
    id: string,
    project: Partial<Pick<Project, "name" | "instructions">>,
  ): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  insertMessages(
    messages: PartialBy<ChatMessage, "createdAt">[],
  ): Promise<ChatMessage[]>;
  grantThreadAccess(
    access: ThreadAccess & { grantedBy: string },
  ): Promise<void>;
  revokeThreadAccess(
    threadId: string,
    userId: string,
    revokedBy: string,
  ): Promise<void>;
  selectThreadAccess(
    threadId: string,
    userId: string,
  ): Promise<ThreadAccess | null>;
  deleteChatMessage(id: string): Promise<void>;
  selectThreadInstructionsByProjectId(
    userId: string,
    projectId: string | undefined,
  ): Promise<{
    instructions: Project["instructions"] | null;
    userPreferences: UserPreferences | undefined;
  }>;
  selectThreadInstructions(
    userId: string,
    threadId: string | undefined,
  ): Promise<{
    instructions: Project["instructions"] | null;
    userPreferences: UserPreferences | undefined;
    threadId: string | undefined;
    projectId: string | undefined;
  }>;
  insertEncryptedMessage(
    message: Omit<EncryptedChatMessage, "createdAt">,
    userId: string,
  ): Promise<EncryptedChatMessage>;
  selectEncryptedMessage(
    id: string,
    userId: string,
  ): Promise<EncryptedChatMessage | null>;
  selectEncryptedMessagesByThreadId(
    threadId: string,
    userId: string,
  ): Promise<EncryptedChatMessage[]>;
}

export interface EncryptedChatMessage {
  id: string;
  threadId: string;
  encryptedContent: Buffer;
  iv: Buffer;
  createdAt: Date;
}

export interface ChatMessageContent {
  role: ChatMessage["role"];
  parts: any[];
  attachments?: any[];
  annotations?: any[];
  model?: string;
}
