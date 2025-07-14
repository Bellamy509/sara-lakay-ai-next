import type {
  MCPServerConfig,
  McpServerInsert,
  McpServerSelect,
  VercelAIMcpTool,
} from "app-types/mcp";
import { createMCPClient, type MCPClient } from "./create-mcp-client";
import { Locker } from "lib/utils";
import { safe } from "ts-safe";
import type { McpServerSchema } from "lib/db/pg/schema.pg";
import { createMCPToolId } from "./mcp-tool-id";
/**
 * Interface for storage of MCP server configurations.
 * Implementations should handle persistent storage of server configs.
 *
 * IMPORTANT: When implementing this interface, be aware that:
 * - Storage can be modified externally (e.g., file edited manually)
 * - Concurrent modifications may occur from multiple processes
 * - Implementations should either handle these scenarios or document limitations
 */
export interface MCPConfigStorage {
  init(manager: MCPClientsManager): Promise<void>;
  loadAll(): Promise<McpServerSelect[]>;
  save(server: McpServerInsert): Promise<McpServerSelect>;
  delete(id: string): Promise<void>;
  has(id: string): Promise<boolean>;
  get(id: string): Promise<McpServerSelect | null>;
}

export class MCPClientsManager {
  protected clients = new Map<
    string,
    {
      client: MCPClient;
      name: string;
    }
  >();
  private initializedLock = new Locker();
  private cleanupHandlers: (() => void)[] = [];

  // Optional storage for persistent configurations
  constructor(
    private storage?: MCPConfigStorage,
    private autoDisconnectSeconds: number = determineAutoDisconnectTime(), // 🎯 Smart auto-disconnect based on environment
  ) {
    // Increase max listeners to prevent warnings
    process.setMaxListeners(20);

    // Store cleanup handlers to remove them later
    const handleSIGINT = this.cleanup.bind(this);
    const handleSIGTERM = this.cleanup.bind(this);

    process.on("SIGINT", handleSIGINT);
    process.on("SIGTERM", handleSIGTERM);

    // Store references to remove them later
    this.cleanupHandlers.push(
      () => process.removeListener("SIGINT", handleSIGINT),
      () => process.removeListener("SIGTERM", handleSIGTERM),
    );

    console.log(
      `🔧 MCP: Manager créé avec auto-disconnect: ${this.autoDisconnectSeconds === 0 ? "DÉSACTIVÉ" : `${this.autoDisconnectSeconds}s`}`,
    );
  }

  async init() {
    return safe(() => this.initializedLock.lock())
      .ifOk(() => this.cleanup())
      .ifOk(async () => {
        if (this.storage) {
          await this.storage.init(this);
          const configs = await this.storage.loadAll();
          await Promise.all(
            configs.map(({ id, name, config }) =>
              this.addClient(id, name, config),
            ),
          );
        }
      })
      .watch(() => this.initializedLock.unlock())
      .unwrap();
  }

  /**
   * Returns all tools from all clients as a flat object
   */
  tools(): Record<string, VercelAIMcpTool> {
    return Object.fromEntries(
      Array.from(this.clients.entries())
        .filter(([_, { client }]) => client.getInfo().toolInfo.length > 0)
        .flatMap(([id, { client }]) =>
          Object.entries(client.tools).map(([name, tool]) => {
            const toolInfo = client
              .getInfo()
              .toolInfo.find((t) => t.name === name);
            return [
              createMCPToolId(client.getInfo().name, name),
              {
                ...tool,
                parameters: {
                  type: toolInfo?.inputSchema?.type || "object",
                  properties: toolInfo?.inputSchema?.properties ?? {},
                  required: toolInfo?.inputSchema?.required ?? [],
                  additionalProperties: false,
                },
                description: toolInfo?.description ?? "",
                _originToolName: name,
                _mcpServerName: client.getInfo().name,
                _mcpServerId: id,
              },
            ];
          }),
        ),
    );
  }
  /**
   * Creates and adds a new client instance to memory only (no storage persistence)
   */
  async addClient(id: string, name: string, serverConfig: MCPServerConfig) {
    const addStart = Date.now();
    console.log(`🔧 MCP: Starting connection to ${name} (${id})...`);

    if (this.clients.has(id)) {
      const prevClient = this.clients.get(id);
      if (prevClient) {
        console.log(`🔧 MCP: Disconnecting previous ${name} client...`);
        void prevClient.client.disconnect();
      }
    }

    try {
      const client = createMCPClient(name, serverConfig, {
        autoDisconnectSeconds: this.autoDisconnectSeconds,
      });

      this.clients.set(id, { client, name });

      // Connecter avec timeout pour éviter les blocages - augmenté pour compatibilité
      const MANAGER_TIMEOUT = process.env.RAILWAY_ENVIRONMENT ? 75000 : 30000;
      const connectionResult = await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Client ${name} connection timeout after ${MANAGER_TIMEOUT}ms`,
                ),
              ),
            MANAGER_TIMEOUT,
          ),
        ),
      ]);

      const addTime = Date.now() - addStart;
      console.log(`✅ MCP: ${name} connected successfully in ${addTime}ms`);

      // Warning pour les connexions lentes
      if (addTime > 10000) {
        console.warn(
          `⚠️ MCP: Slow connection - ${name} took ${(addTime / 1000).toFixed(2)}s to connect`,
        );
      }

      return connectionResult;
    } catch (error) {
      const addTime = Date.now() - addStart;
      console.error(
        `❌ MCP: Failed to connect ${name} after ${addTime}ms:`,
        error,
      );

      // Nettoyer le client en cas d'échec
      this.clients.delete(id);
      throw error;
    }
  }

  /**
   * Persists a new client configuration to storage and adds the client instance to memory
   */
  async persistClient(server: typeof McpServerSchema.$inferInsert) {
    let id = server.name;
    if (this.storage) {
      const entity = await this.storage.save(server);
      id = entity.id;
    }
    return this.addClient(id, server.name, server.config);
  }

  /**
   * Removes a client by name, disposing resources and removing from storage
   */
  async removeClient(id: string) {
    if (this.storage) {
      if (await this.storage.has(id)) {
        await this.storage.delete(id);
      }
    }
    const client = this.clients.get(id);
    this.clients.delete(id);
    if (client) {
      void client.client.disconnect();
    }
  }

  /**
   * Refreshes an existing client with a new configuration or its existing config
   */
  async refreshClient(id: string) {
    const prevClient = this.clients.get(id);
    if (!prevClient) {
      throw new Error(`Client ${id} not found`);
    }
    const currentConfig = prevClient.client.getInfo().config;
    if (this.storage) {
      const server = await this.storage.get(id);
      if (!server) {
        throw new Error(`Client ${id} not found`);
      }
      return this.addClient(id, server.name, server.config);
    }
    return this.addClient(id, prevClient.name, currentConfig);
  }

  async cleanup() {
    // Remove process event listeners first
    for (const handler of this.cleanupHandlers) {
      handler();
    }
    this.cleanupHandlers.length = 0;

    // Disconnect all clients
    const clients = Array.from(this.clients.values());
    this.clients.clear();
    await Promise.allSettled(clients.map(({ client }) => client.disconnect()));
  }

  async getClients() {
    await this.initializedLock.wait();
    return Array.from(this.clients.entries()).map(([id, { client }]) => ({
      id,
      client: client,
    }));
  }
  async getClient(id: string) {
    await this.initializedLock.wait();
    return this.clients.get(id);
  }
}

// 🎯 Determine auto-disconnect time based on environment
function determineAutoDisconnectTime(): number {
  // Railway/Production: Keep connections alive longer (30 minutes)
  if (
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.NODE_ENV === "production"
  ) {
    return 60 * 30; // 30 minutes for production stability
  }

  // Development: Standard timeout (5 minutes)
  return 60 * 5; // 5 minutes for development
}

export function createMCPClientsManager(
  storage?: MCPConfigStorage,
  autoDisconnectSeconds: number = determineAutoDisconnectTime(), // 🎯 Smart auto-disconnect
): MCPClientsManager {
  return new MCPClientsManager(storage, autoDisconnectSeconds);
}
