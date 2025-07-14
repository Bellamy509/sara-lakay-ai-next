import { ChatMessage, Project } from "app-types/chat";
import { UserPreferences } from "app-types/user";
import { MCPServerConfig } from "app-types/mcp";
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  json,
  uuid,
  boolean,
  unique,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

export const ChatThreadSchema = pgTable("chat_thread", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  projectId: uuid("project_id"),
});

export const ChatMessageSchema = pgTable("chat_message", {
  id: text("id").primaryKey().notNull(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => ChatThreadSchema.id),
  role: text("role").notNull().$type<ChatMessage["role"]>(),
  parts: json("parts").notNull().array(),
  attachments: json("attachments").array(),
  annotations: json("annotations").array(),
  model: text("model"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ProjectSchema = pgTable("project", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id),
  instructions: json("instructions").$type<Project["instructions"]>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const McpServerSchema = pgTable("mcp_server", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  config: json("config").notNull().$type<MCPServerConfig>(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const UserSchema = pgTable("user", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  password: text("password"),
  image: text("image"),
  preferences: json("preferences").default({}).$type<UserPreferences>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const SessionSchema = pgTable("session", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id, { onDelete: "cascade" }),
});

export const AccountSchema = pgTable("account", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const VerificationSchema = pgTable("verification", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

// Tool customization table for per-user additional AI instructions
export const McpToolCustomizationSchema = pgTable(
  "mcp_server_tool_custom_instructions",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerSchema.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [unique().on(table.userId, table.toolName, table.mcpServerId)],
);

export const McpServerCustomizationSchema = pgTable(
  "mcp_server_custom_instructions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerSchema.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [unique().on(table.userId, table.mcpServerId)],
);

// Table for temporary download files
export const TempFileSchema = pgTable("temp_file", {
  id: text("id").primaryKey().notNull(), // UUID for download
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id),
});

export const ChatThreadAccessSchema = pgTable(
  "chat_thread_access",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => ChatThreadSchema.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    accessType: text("access_type")
      .notNull()
      .$type<"owner" | "viewer" | "editor">(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => UserSchema.id),
  },
  (table) => ({
    uniqueAccess: unique().on(table.threadId, table.userId),
  }),
);

export const EncryptedChatMessageSchema = pgTable("encrypted_chat_message", {
  id: text("id").primaryKey().notNull(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => ChatThreadSchema.id, { onDelete: "cascade" }),
  encryptedContent: text("encrypted_content").notNull(),
  iv: text("iv").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const toolUserAccess = pgTable("tool_user_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id, { onDelete: "cascade" }),
  toolId: varchar("tool_id", { length: 255 }).notNull(),
  serverId: varchar("server_id", { length: 255 }).notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const userConnection = pgTable("user_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id, { onDelete: "cascade" }),
  connectionToken: text("connection_token").notNull().unique(),
  toolAccessId: uuid("tool_access_id").references(() => toolUserAccess.id, {
    onDelete: "cascade",
  }),
  lastActivity: timestamp("last_activity", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  deviceInfo: jsonb("device_info").default({}),
  isActive: boolean("is_active").default(true),
});

export type McpServerEntity = typeof McpServerSchema.$inferSelect;
export type ChatThreadEntity = typeof ChatThreadSchema.$inferSelect;
export type ChatMessageEntity = typeof ChatMessageSchema.$inferSelect;
export type ProjectEntity = typeof ProjectSchema.$inferSelect;
export type UserEntity = typeof UserSchema.$inferSelect;
export type ToolCustomizationEntity =
  typeof McpToolCustomizationSchema.$inferSelect;
export type McpServerCustomizationEntity =
  typeof McpServerCustomizationSchema.$inferSelect;
export type TempFileEntity = typeof TempFileSchema.$inferSelect;
export type ChatThreadAccessEntity = typeof ChatThreadAccessSchema.$inferSelect;
