// Importation des repositories mockés pour fonctionnement sans base de données
import { mockChatRepository, mockUserRepository } from "./mock-repositories";

// Imports des vrais repositories PostgreSQL (seulement MCP pour Railway)
import { pgMcpRepository } from "./pg/repositories/mcp-repository.pg";
import { pgMcpMcpToolCustomizationRepository } from "./pg/repositories/mcp-tool-customization-repository.pg";
import { pgMcpServerCustomizationRepository } from "./pg/repositories/mcp-server-customization-repository.pg";

// Utilisation des vrais repositories PostgreSQL pour MCP (car nécessaires pour Railway)
export const chatRepository = mockChatRepository; // Garde le mock pour les chats
export const userRepository = mockUserRepository; // Garde le mock pour les users

// Vrais repositories MCP PostgreSQL (nécessaires pour Railway)
export const mcpRepository = pgMcpRepository;
export const mcpMcpToolCustomizationRepository =
  pgMcpMcpToolCustomizationRepository;
export const mcpServerCustomizationRepository =
  pgMcpServerCustomizationRepository;
