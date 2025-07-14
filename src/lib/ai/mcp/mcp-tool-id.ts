/**
 * Sanitizes a name to be compatible with function name requirements:
 * - Must start with a letter or underscore
 * - Can only contain alphanumeric characters, underscores, dots, or dashes
 * - Maximum length of 64 characters
 */
export const sanitizeFunctionName = (name: string): string => {
  // Replace any characters that aren't alphanumeric, underscore, dot, or dash with underscore
  let sanitized = name.replace(/[^a-zA-Z0-9_\.\-]/g, "_");

  // Ensure it starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }

  // Truncate to 64 characters if needed
  if (sanitized.length > 64) {
    sanitized = sanitized.substring(0, 64);
  }

  return sanitized;
};

export const createMCPToolId = (serverName: string, toolName: string) => {
  // Sanitize both server name and tool name individually
  const sanitizedServer = sanitizeFunctionName(serverName);
  const sanitizedTool = sanitizeFunctionName(toolName);

  // Ensure the combined name doesn't exceed 64 characters
  // Reserve some characters for the separator
  const maxLength = 64;
  const separator = "_";

  if (
    sanitizedServer.length + sanitizedTool.length + separator.length >
    maxLength
  ) {
    // Allocate space proportionally
    const totalLength = sanitizedServer.length + sanitizedTool.length;
    const serverPortion = Math.floor(
      (sanitizedServer.length / totalLength) * (maxLength - separator.length),
    );
    const toolPortion = maxLength - separator.length - serverPortion;

    return `${sanitizedServer.substring(0, serverPortion)}${separator}${sanitizedTool.substring(0, toolPortion)}`;
  }

  return `${sanitizedServer}${separator}${sanitizedTool}`;
};

export const extractMCPToolId = (toolId: string) => {
  const [serverName, ...toolName] = toolId.split("_");
  return { serverName, toolName: toolName.join("_") };
};

// Enhanced version that can handle server names with underscores
export const extractMCPToolIdWithServerNames = (
  toolId: string,
  availableServerNames: string[],
) => {
  // First, try to match against known server names (sanitized)
  const sanitizedServerNames = availableServerNames.map((name) => ({
    original: name,
    sanitized: sanitizeFunctionName(name),
  }));

  // Sort by length (longest first) to prefer longer matches
  const sortedServers = sanitizedServerNames.sort(
    (a, b) => b.sanitized.length - a.sanitized.length,
  );

  for (const server of sortedServers) {
    if (toolId.startsWith(server.sanitized + "_")) {
      const toolName = toolId.substring(server.sanitized.length + 1);
      return {
        serverName: server.original,
        toolName,
      };
    }
  }

  // Fallback to original method if no match found
  const [serverName, ...toolName] = toolId.split("_");
  return { serverName, toolName: toolName.join("_") };
};
