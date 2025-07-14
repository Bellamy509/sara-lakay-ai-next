"use server";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { z } from "zod";
import { Safe, safe } from "ts-safe";
import { errorToString } from "lib/utils";
import { McpServerSchema } from "lib/db/pg/schema.pg";

// Variable pour éviter la double initialisation
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

export async function selectMcpClientsAction() {
  try {
    // 🛡️ ROBUST INITIALIZATION - Prevent multiple simultaneous initializations
    if (!isInitialized && !initializationPromise) {
      initializationPromise = initializeIntelligentSystem();
      await initializationPromise;
      initializationPromise = null;
      isInitialized = true;
    } else if (initializationPromise) {
      // Wait for ongoing initialization
      await initializationPromise;
    }

    const list = await mcpClientsManager.getClients();
    console.log(`📋 MCP: Retour de ${list.length} clients actifs`);

    // 🔍 If no clients but initialized, something went wrong - try to recover once
    if (list.length === 0 && isInitialized) {
      console.warn(
        "⚠️ MCP: Clients perdus, tentative de récupération unique...",
      );
      isInitialized = false; // Allow one recovery attempt
      return selectMcpClientsAction(); // Recursive call for recovery
    }

    const result = list.map(({ client, id }) => {
      const info = client.getInfo();
      console.log(
        `🔧 MCP: Client ${id}: ${info.name} (${info.toolInfo.length} outils)`,
      );

      // Format the data correctly for the UI
      const formattedData = {
        id,
        name: info.name,
        description: (info as any).description || "",
        status: "connected" as const,
        toolInfo: info.toolInfo || [],
        config: (info as any).config || {
          command: "npx", // Default command
          args: [], // Default args
        },
        error: null,
      };

      return formattedData;
    });

    console.log(`🔧 MCP: Résultat final: ${result.length} serveurs formatés`);
    return result;
  } catch (error) {
    console.error("❌ MCP: Erreur dans selectMcpClientsAction:", error);
    return [];
  }
}

async function initializeIntelligentSystem(): Promise<void> {
  console.log("🎯 MCP: Initialisation avec système intelligent unifié...");

  // 🚨 SKIP traditional init - Go directly to intelligent configuration
  console.log("🎯 MCP: Configuration intelligente comme système PRIMARY...");

  try {
    const { generateMCPConfig, getEnvironmentInfo, performHealthChecks } =
      await import("../../../lib/ai/mcp/mcp-environment-config");

    const envInfo = getEnvironmentInfo();
    console.log(
      "🌍 MCP: Environnement détecté:",
      JSON.stringify(envInfo, null, 2),
    );

    // Generate intelligent configuration based on environment
    const intelligentConfig = generateMCPConfig();
    console.log(
      `🎯 MCP: Configuration intelligente générée - ${Object.keys(intelligentConfig).length} serveurs pour ${envInfo.environment}`,
    );

    // Perform health checks to ensure dependencies are available
    console.log("🏥 MCP: Vérifications de santé en cours...");
    const healthResults = await performHealthChecks();
    const healthyServers = Object.entries(healthResults)
      .filter(([_, healthy]) => healthy)
      .map(([server, _]) => server);
    console.log(
      `🏥 MCP: ${healthyServers.length}/${Object.keys(healthResults).length} serveurs en bonne santé:`,
      healthyServers,
    );

    // Connect to servers using intelligent configuration with better error handling
    let connectedCount = 0;
    const connectionPromises = Object.entries(intelligentConfig).map(
      async ([serverId, serverConfig]) => {
        try {
          console.log(`🔗 MCP: Connexion intelligente à ${serverId}...`);
          console.log(
            `🔧 MCP: Config générée pour ${serverId}:`,
            JSON.stringify(serverConfig, null, 2),
          );

          await mcpClientsManager.addClient(serverId, serverId, serverConfig);
          console.log(`✅ MCP: ${serverId} connecté avec succès (intelligent)`);
          return { serverId, success: true };
        } catch (error) {
          console.error(
            `❌ MCP: ${serverId} échec de connexion (intelligent):`,
            error,
          );
          return { serverId, success: false, error };
        }
      },
    );

    // Attendre toutes les connexions en parallèle pour améliorer les performances
    const results = await Promise.allSettled(connectionPromises);
    connectedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value.success,
    ).length;

    console.log(
      `🎯 MCP: Configuration intelligente terminée - ${connectedCount}/${Object.keys(intelligentConfig).length} serveurs connectés`,
    );

    // If NO servers connected, provide minimal fallback
    if (connectedCount === 0) {
      console.warn(
        "⚠️ MCP: Aucun serveur connecté, utilisation config de sécurité...",
      );

      const safetyConfig = {
        "sequential-thinking": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
        },
        time: {
          command: "npx",
          args: ["-y", "time-mcp"],
        },
      };

      for (const [name, config] of Object.entries(safetyConfig)) {
        try {
          await mcpClientsManager.addClient(name, name, config);
          console.log(`✅ MCP: ${name} connecté (sécurité)`);
          connectedCount++;
        } catch (error) {
          console.error(`❌ MCP: ${name} échec (sécurité):`, error);
        }
      }
    }

    console.log(
      `🏁 MCP: Initialisation terminée avec ${connectedCount} serveurs actifs`,
    );
  } catch (intelligentSystemError) {
    console.error(
      "💥 MCP: Erreur système intelligent:",
      intelligentSystemError,
    );
    throw new Error(
      `Système MCP intelligent défaillant: ${intelligentSystemError}`,
    );
  }
}

export async function selectMcpClientAction(id: string) {
  const client = await mcpClientsManager.getClient(id);
  if (!client) {
    throw new Error("Client not found");
  }
  return {
    ...client.client.getInfo(),
    id,
  };
}

export async function saveMcpClientAction(
  server: typeof McpServerSchema.$inferInsert,
) {
  if (process.env.NOT_ALLOW_ADD_MCP_SERVERS) {
    throw new Error("Not allowed to add MCP servers");
  }
  // Validate name to ensure it only contains alphanumeric characters and hyphens
  const nameSchema = z.string().regex(/^[a-zA-Z0-9\-]+$/, {
    message:
      "Name must contain only alphanumeric characters (A-Z, a-z, 0-9) and hyphens (-)",
  });

  const result = nameSchema.safeParse(server.name);
  if (!result.success) {
    throw new Error(
      "Name must contain only alphanumeric characters (A-Z, a-z, 0-9) and hyphens (-)",
    );
  }

  await mcpClientsManager.persistClient(server);
}

export async function existMcpClientByServerNameAction(serverName: string) {
  const client = await mcpClientsManager.getClients().then((clients) => {
    return clients.find(
      (client) => client.client.getInfo().name === serverName,
    );
  });
  return !!client;
}

export async function removeMcpClientAction(id: string) {
  await mcpClientsManager.removeClient(id);
}

export async function refreshMcpClientAction(id: string) {
  await mcpClientsManager.refreshClient(id);
}

function safeCallToolResult(chain: Safe<any>) {
  return chain
    .ifFail((err) => {
      console.error(err);
      return {
        isError: true,
        content: [
          JSON.stringify({
            error: { message: errorToString(err), name: err?.name },
          }),
        ],
      };
    })
    .unwrap();
}

export async function callMcpToolAction(
  id: string,
  toolName: string,
  input?: unknown,
) {
  const chain = safe(async () => {
    const client = await mcpClientsManager.getClient(id);
    if (!client) {
      throw new Error("Client not found");
    }
    return client.client.callTool(toolName, input).then((res) => {
      if (res?.isError) {
        throw new Error(
          res.content?.[0]?.text ??
            JSON.stringify(res.content, null, 2) ??
            "Unknown error",
        );
      }
      return res;
    });
  });
  return safeCallToolResult(chain);
}

export async function callMcpToolByServerNameAction(
  serverName: string,
  toolName: string,
  input?: unknown,
) {
  const chain = safe(async () => {
    const clients = await mcpClientsManager.getClients();

    // First try to find with exact name match
    let client = clients.find(
      (client) => client.client.getInfo().name === serverName,
    );

    // If not found, try with reverse sanitizing (replace underscores with spaces)
    if (!client) {
      const unsanitizedName = serverName.replace(/_/g, " ");
      client = clients.find(
        (client) => client.client.getInfo().name === unsanitizedName,
      );
    }

    // If still not found, try with different cases
    if (!client) {
      client = clients.find(
        (client) =>
          client.client.getInfo().name.toLowerCase() ===
          serverName.toLowerCase(),
      );
    }

    if (!client) {
      throw new Error(`Client not found for server: ${serverName}`);
    }
    return client.client.callTool(toolName, input);
  });
  return safeCallToolResult(chain);
}
