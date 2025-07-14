import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  type MCPServerInfo,
  MCPRemoteConfigZodSchema,
  MCPStdioConfigZodSchema,
  type MCPServerConfig,
  type MCPToolInfo,
} from "app-types/mcp";
import { jsonSchema, tool, ToolExecutionOptions } from "ai";
import { isMaybeRemoteConfig, isMaybeStdioConfig } from "./is-mcp-config";
import logger from "logger";
import type { ConsolaInstance } from "consola";
import { colorize } from "consola/utils";
import {
  createDebounce,
  errorToString,
  isNull,
  Locker,
  toAny,
} from "lib/utils";

import { safe } from "ts-safe";
import { IS_MCP_SERVER_REMOTE_ONLY } from "lib/const";
import { toolAccessRepository } from "lib/db/pg/repositories/tool-access-repository.pg";
import { userConnectionRepository } from "lib/db/pg/repositories/user-connection-repository.pg";

type ClientOptions = {
  autoDisconnectSeconds?: number;
};

/**
 * Client class for Model Context Protocol (MCP) server connections
 */
export class MCPClient {
  private client?: Client;
  private error?: unknown;
  private isConnected = false;
  private log: ConsolaInstance;
  private locker = new Locker();
  private userId?: string;
  // Information about available tools from the server
  toolInfo: MCPToolInfo[] = [];
  // Tool instances that can be used for AI functions
  tools: { [key: string]: (input: any) => Promise<any> } = {};

  constructor(
    private name: string,
    private serverConfig: MCPServerConfig,
    private options: ClientOptions = {},
    private disconnectDebounce = createDebounce(),
  ) {
    this.log = logger.withDefaults({
      message: colorize("cyan", `MCP Client ${this.name}: `),
    });
  }

  getInfo(): MCPServerInfo {
    return {
      name: this.name,
      config: this.serverConfig,
      status: this.locker.isLocked
        ? "loading"
        : this.isConnected
          ? "connected"
          : "disconnected",
      error: this.error,
      toolInfo: this.toolInfo,
    };
  }

  private scheduleAutoDisconnect() {
    if (
      this.options.autoDisconnectSeconds &&
      this.options.autoDisconnectSeconds > 0
    ) {
      this.disconnectDebounce(() => {
        this.log.info(
          `Auto-disconnecting after ${this.options.autoDisconnectSeconds}s of inactivity`,
        );
        this.disconnect();
      }, this.options.autoDisconnectSeconds * 1000);
    }
  }

  /**
   * Connect to the MCP server
   * Do not throw Error
   * @returns this
   */
  async connect() {
    if (this.locker.isLocked) {
      await this.locker.wait();
      return this.client;
    }
    if (this.isConnected) {
      return this.client;
    }

    const CONNECTION_TIMEOUT = process.env.RAILWAY_ENVIRONMENT ? 90000 : 30000;

    try {
      const startedAt = Date.now();
      this.locker.lock();

      this.log.info(
        `Attempting to connect to ${this.name}... (timeout: ${CONNECTION_TIMEOUT}ms)`,
      );

      const client = new Client({
        name: "mcp-chatbot-client",
        version: "1.0.0",
      });

      const connectWithTimeout = async () => {
        return Promise.race([
          this.performConnection(client),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`Connection timeout after ${CONNECTION_TIMEOUT}ms`),
                ),
              CONNECTION_TIMEOUT,
            ),
          ),
        ]);
      };

      await connectWithTimeout();

      const connectionTime = Date.now() - startedAt;
      this.log.info(
        `Connected to MCP server in ${(connectionTime / 1000).toFixed(2)}s`,
      );

      if (connectionTime > 5000) {
        this.log.warn(
          `Slow connection detected: ${this.name} took ${(connectionTime / 1000).toFixed(2)}s to connect`,
        );
      }

      this.isConnected = true;
      this.error = undefined;
      this.client = client;

      await this.loadToolsAsync(client);

      if (
        !process.env.RAILWAY_ENVIRONMENT &&
        !process.env.NODE_ENV?.includes("production")
      ) {
        this.scheduleAutoDisconnect();
      }
    } catch (error) {
      this.log.error(`Failed to connect to ${this.name}:`, error);
      this.isConnected = false;
      this.error = error;

      // 🛡️ Don't throw - let the system continue with other clients
      // throw error; // Removed to prevent cascade failures
    }

    this.locker.unlock();
    return this.client;
  }

  private async performConnection(client: Client) {
    if (isMaybeStdioConfig(this.serverConfig)) {
      if (IS_MCP_SERVER_REMOTE_ONLY) {
        throw new Error("Stdio transport is not supported");
      }

      const config = MCPStdioConfigZodSchema.parse(this.serverConfig);

      // 🐍 Debug pour serveurs Python
      const isPythonCommand =
        config.command === "python3" || config.command?.includes("python");
      if (isPythonCommand) {
        this.log.info(`🐍 Python server detected:`);
        this.log.info(`   Command: ${config.command}`);
        this.log.info(`   Args: ${JSON.stringify(config.args)}`);
        this.log.info(`   Working Directory: ${process.cwd()}`);
        if (config.env) {
          this.log.info(`   Environment: ${JSON.stringify(config.env)}`);
        }
      }

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: Object.entries({ ...process.env, ...config.env }).reduce(
          (acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
        cwd: process.cwd(),
      });

      await client.connect(transport);
    } else if (isMaybeRemoteConfig(this.serverConfig)) {
      const config = MCPRemoteConfigZodSchema.parse(this.serverConfig);
      const abortController = new AbortController();
      const url = new URL(config.url);
      try {
        const transport = new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers: config.headers,
            signal: abortController.signal,
          },
        });
        await client.connect(transport);
      } catch {
        this.log.info(
          "Streamable HTTP connection failed, falling back to SSE transport",
        );
        const transport = new SSEClientTransport(url, {
          requestInit: {
            headers: config.headers,
            signal: abortController.signal,
          },
        });
        await client.connect(transport);
      }
    } else {
      throw new Error("Invalid server config");
    }
  }

  private async loadToolsAsync(client: Client) {
    const toolLoadStart = Date.now();

    try {
      this.log.info(`🔧 Loading tools for ${this.name}...`);

      // 🚀 Timeout plus long pour serveurs Python qui peuvent être lents
      const isPythonServer =
        isMaybeStdioConfig(this.serverConfig) &&
        (this.serverConfig.command === "python3" ||
          this.serverConfig.command?.includes("python") ||
          this.serverConfig.args?.[0]?.includes(".py"));

      const TOOL_LOAD_TIMEOUT = isPythonServer
        ? process.env.RAILWAY_ENVIRONMENT
          ? 45000
          : 20000 // Python: 45s Railway, 20s local
        : process.env.RAILWAY_ENVIRONMENT
          ? 15000
          : 10000; // NPM: 15s Railway, 10s local

      const toolLoadWithTimeout = async () => {
        return Promise.race([
          client.listTools(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Tool loading timeout after ${TOOL_LOAD_TIMEOUT}ms`,
                  ),
                ),
              TOOL_LOAD_TIMEOUT,
            ),
          ),
        ]);
      };

      const toolResponse = await toolLoadWithTimeout();

      this.toolInfo = toolResponse.tools.map(
        (tool) =>
          ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          }) as MCPToolInfo,
      );

      this.tools = toolResponse.tools.reduce((prev, _tool) => {
        const parameters = jsonSchema(
          toAny({
            ..._tool.inputSchema,
            type: _tool.inputSchema?.type || "object",
            properties: _tool.inputSchema?.properties ?? {},
            additionalProperties: false,
          }),
        );
        prev[_tool.name] = tool({
          parameters,
          description: _tool.description,
          execute: (params, options: ToolExecutionOptions) => {
            options?.abortSignal?.throwIfAborted();
            return this.callTool(_tool.name, params);
          },
        });
        return prev;
      }, {});

      const toolLoadTime = Date.now() - toolLoadStart;
      this.log.info(
        `✅ Loaded ${toolResponse.tools.length} tools in ${toolLoadTime}ms`,
      );

      if (toolResponse.tools.length === 0) {
        this.log.warn(
          `⚠️  No tools found for ${this.name} - server may not be responding correctly`,
        );
      }
    } catch (error) {
      const toolLoadTime = Date.now() - toolLoadStart;
      this.log.error(
        `❌ Failed to load tools for ${this.name} after ${toolLoadTime}ms:`,
        error,
      );

      // 🛡️ Set empty tools but don't crash the client
      this.toolInfo = [];
      this.tools = {};

      // 🔄 For Python servers, attempt a retry after 2 seconds
      const isPythonServerForRetry =
        isMaybeStdioConfig(this.serverConfig) &&
        (this.serverConfig.command === "python3" ||
          this.serverConfig.command?.includes("python") ||
          this.serverConfig.args?.[0]?.includes(".py"));

      if (isPythonServerForRetry && toolLoadTime < 10000) {
        this.log.info(
          `🔄 Retrying tool loading for Python server ${this.name} in 2s...`,
        );
        setTimeout(async () => {
          try {
            await this.loadToolsAsync(client);
          } catch (retryError) {
            this.log.error(`🚫 Retry failed for ${this.name}:`, retryError);
          }
        }, 2000);
      }
    }
  }

  async disconnect(): Promise<void> {
    this.log.info("Disconnecting from MCP server");
    await this.locker.wait();
    this.isConnected = false;
    const client = this.client;
    this.client = undefined;
    await client?.close().catch((e) => this.log.error(e));

    // Désactiver toutes les connexions actives
    if (this.userId) {
      const activeConnection =
        await userConnectionRepository.getActiveConnection(this.userId);
      if (activeConnection) {
        await userConnectionRepository.deactivateConnection(
          activeConnection.id,
        );
      }
    }
  }
  async callTool(toolName: string, input?: unknown) {
    const callStart = Date.now();

    return safe(() => this.log.info(`Tool call started: ${toolName}`))
      .ifOk(() => {
        if (this.error) {
          throw new Error(
            "MCP Server is currently in an error state. Please check the configuration and try refreshing the server.",
          );
        }
      })
      .ifOk(() => this.scheduleAutoDisconnect())
      .map(async () => {
        let client = this.client;
        if (!this.isConnected || !client) {
          client = await this.connect();
        }

        if (!client) {
          throw new Error("Failed to establish connection to MCP server");
        }

        const result = await client.callTool({
          name: toolName,
          arguments: input as Record<string, unknown>,
        });

        const callTime = Date.now() - callStart;
        this.log.info(`Tool call completed: ${toolName} in ${callTime}ms`);

        if (callTime > 2000) {
          this.log.warn(
            `Slow tool call detected: ${toolName} took ${callTime}ms`,
          );
        }

        return result;
      })
      .ifOk((v) => {
        if (isNull(v)) {
          throw new Error("Tool call failed with null");
        }
        return v;
      })
      .ifOk(() => this.scheduleAutoDisconnect())
      .watch((status) => {
        if (!status.isOk) {
          this.log.error("Tool call failed", toolName, status.error);
        } else if (status.value?.isError) {
          this.log.error("Tool call failed", toolName, status.value.content);
        }
      })
      .ifFail((error) => {
        const errorTime = Date.now() - callStart;
        this.log.error(
          `Tool call failed after ${errorTime}ms:`,
          toolName,
          error,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: {
                  message: errorToString(error),
                  name: error?.name,
                  executionTime: errorTime,
                },
              }),
            },
          ],
          isError: true,
        };
      })
      .unwrap();
  }

  async executeTool(
    toolName: string,
    input: any,
    userId?: string,
  ): Promise<any> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }

    // Stocker l'userId pour la déconnexion
    this.userId = userId;

    // Vérifier l'accès utilisateur si un userId est fourni
    if (userId) {
      const access = await toolAccessRepository.getAccess(
        userId,
        toolName,
        this.name,
      );
      if (!access) {
        throw new Error(
          `User ${userId} does not have access to tool ${toolName} on server ${this.name}`,
        );
      }

      // Vérifier si le token est expiré
      if (access.expiresAt && access.expiresAt < new Date()) {
        throw new Error(`Access token expired for tool ${toolName}`);
      }

      // Vérifier et gérer la connexion unique
      const existingConnection =
        await userConnectionRepository.getActiveConnection(userId, access.id);
      if (existingConnection) {
        // Mettre à jour l'activité de la connexion existante
        await userConnectionRepository.updateLastActivity(
          existingConnection.id,
        );
      } else {
        // Créer une nouvelle connexion
        await userConnectionRepository.createConnection({
          userId,
          toolAccessId: access.id,
          deviceInfo: {
            toolName,
            serverName: this.name,
            timestamp: new Date().toISOString(),
          },
          isActive: true,
        });
      }
    }

    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on server ${this.name}`);
    }

    return tool(input);
  }
}

/**
 * Factory function to create a new MCP client
 */
export const createMCPClient = (
  name: string,
  serverConfig: MCPServerConfig,
  options: ClientOptions = {},
): MCPClient => new MCPClient(name, serverConfig, options);
