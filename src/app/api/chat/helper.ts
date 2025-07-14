import { LoadAPIKeyError, Message, Tool, tool as createTool } from "ai";
import type { ChatMessage, MessagePart } from "app-types/chat";
import {
  ChatMention,
  ChatMessageAnnotation,
  ToolInvocationUIPart,
} from "app-types/chat";
import { errorToString, objectFlow } from "lib/utils";
import { callMcpToolAction } from "../mcp/actions";
import { safe } from "ts-safe";
import logger from "logger";
import { defaultTools } from "lib/ai/tools";
import {
  AllowedMCPServer,
  McpServerCustomizationsPrompt,
  VercelAIMcpTool,
} from "app-types/mcp";
import { MANUAL_REJECT_RESPONSE_PROMPT } from "lib/ai/prompts";

export function filterToolsByMentions(
  tools: Record<string, VercelAIMcpTool>,
  mentions: ChatMention[],
) {
  const toolMentions = mentions.filter(
    (mention) => mention.type == "tool" || mention.type == "mcpServer",
  );
  if (toolMentions.length === 0) {
    return tools;
  }

  const metionsByServer = toolMentions.reduce(
    (acc, mention) => {
      if (mention.type == "mcpServer") {
        return {
          ...acc,
          [mention.serverId]: Object.values(tools).map(
            (tool) => tool._originToolName,
          ),
        };
      }
      if (mention.type == "tool") {
        return {
          ...acc,
          [mention.serverId]: [...(acc[mention.serverId] ?? []), mention.name],
        };
      }
      return acc;
    },
    {} as Record<string, string[]>,
  ); // {serverId: [toolName1, toolName2]}

  return objectFlow(tools).filter((_tool) => {
    if (!metionsByServer[_tool._mcpServerId]) return false;
    return metionsByServer[_tool._mcpServerId].includes(_tool._originToolName);
  });
}

export function filterToolsByAllowedMCPServers(
  tools: Record<string, VercelAIMcpTool>,
  allowedMcpServers?: Record<string, AllowedMCPServer>,
): Record<string, VercelAIMcpTool> {
  if (!allowedMcpServers) {
    return tools;
  }
  return objectFlow(tools).filter((_tool) => {
    if (!allowedMcpServers[_tool._mcpServerId]?.tools) return true;
    return allowedMcpServers[_tool._mcpServerId].tools.includes(
      _tool._originToolName,
    );
  });
}
export function getAllowedDefaultToolkit(
  allowedAppDefaultToolkit?: string[],
): Record<string, Tool> {
  if (!allowedAppDefaultToolkit) {
    return Object.values(defaultTools).reduce((acc, toolkit) => {
      return { ...acc, ...toolkit };
    }, {});
  }
  return allowedAppDefaultToolkit.reduce((acc, toolkit) => {
    return { ...acc, ...(defaultTools[toolkit] ?? {}) };
  }, {});
}

export function excludeToolExecution(
  tool: Record<string, Tool>,
): Record<string, Tool> {
  return objectFlow(tool).map((value) => {
    return createTool({
      parameters: value.parameters,
      description: value.description,
    });
  });
}

export function appendAnnotations(
  annotations: any[] = [],
  annotationsToAppend: ChatMessageAnnotation[] | ChatMessageAnnotation,
): ChatMessageAnnotation[] {
  const newAnnotations = Array.isArray(annotationsToAppend)
    ? annotationsToAppend
    : [annotationsToAppend];
  return [...annotations, ...newAnnotations];
}

export function mergeSystemPrompt(...prompts: (string | undefined)[]): string {
  const filteredPrompts = prompts
    .map((prompt) => prompt?.trim())
    .filter(Boolean);
  return filteredPrompts.join("\n\n");
}

export async function manualToolExecuteByLastMessage(
  part: ToolInvocationUIPart,
  message: Message,
  tools: Record<string, VercelAIMcpTool>,
): Promise<any> {
  if (!part?.toolInvocation?.args || !part?.toolInvocation?.toolName) {
    logger.warn("Invalid tool invocation part:", part);
    return Promise.reject(new Error("Invalid tool invocation"));
  }

  const { args, toolName } = part.toolInvocation;

  const manualConfirmation = Array.isArray(message.parts)
    ? (message.parts as ToolInvocationUIPart[]).find(
        (
          _part,
        ): _part is ToolInvocationUIPart & {
          toolInvocation: { state: "result"; result: any };
        } => {
          return (
            _part?.toolInvocation?.state === "result" &&
            _part?.toolInvocation?.toolCallId ===
              part.toolInvocation.toolCallId &&
            "result" in _part.toolInvocation
          );
        },
      )?.toolInvocation
    : undefined;

  if (!manualConfirmation?.result) {
    return Promise.resolve(MANUAL_REJECT_RESPONSE_PROMPT);
  }

  const tool = tools[toolName];

  try {
    const result = await safe(() => {
      if (!tool) throw new Error(`Tool not found: ${toolName}`);
      return callMcpToolAction(tool._mcpServerId, tool._originToolName, args);
    })
      .ifFail((error) => ({
        isError: true,
        statusMessage: `Tool call failed: ${toolName}`,
        error: errorToString(error),
      }))
      .unwrap();

    return Promise.resolve(result);
  } catch (error) {
    logger.error("Error in manual tool execution:", error);
    return Promise.reject(error);
  }
}

export function handleError(error: any) {
  // Log the full error details for debugging
  logger.error("Chat error details:", {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    status: error?.status,
    stack: error?.stack,
    cause: error?.cause,
  });

  // Handle API key errors
  if (LoadAPIKeyError.isInstance(error)) {
    return {
      error: "API Key Error",
      message: error.message,
      status: 401,
    };
  }

  // Handle timeout errors
  if (error.name === "AbortError" || error.message?.includes("timed out")) {
    return {
      error: "Request timed out",
      message: "The operation took too long to complete. Please try again.",
      status: 504,
    };
  }

  // Handle database errors
  if (error.code?.startsWith("23")) {
    return {
      error: "Database error",
      message: "A database error occurred. Please try again.",
      status: 409,
    };
  }

  // Handle authorization errors
  if (
    error.code?.startsWith("28") ||
    error.status === 401 ||
    error.status === 403
  ) {
    return {
      error: "Authorization error",
      message: "You do not have permission to perform this action.",
      status: 403,
    };
  }

  // Handle network errors
  if (
    error.code === "ECONNREFUSED" ||
    error.code === "ECONNRESET" ||
    error.name === "NetworkError"
  ) {
    return {
      error: "Network error",
      message: "Could not connect to the server. Please check your connection.",
      status: 503,
    };
  }

  // Handle validation errors
  if (error.name === "ValidationError" || error.name === "TypeError") {
    return {
      error: "Validation error",
      message: "Invalid input provided. Please check your request.",
      status: 400,
    };
  }

  // Default error response
  return {
    error: "Internal server error",
    message: "An unexpected error occurred. Please try again later.",
    status: 500,
  };
}

export function convertToMessage(message: ChatMessage): Message {
  // Validation stricte du message
  if (!message || typeof message !== "object") {
    logger.warn("Invalid message object received:", message);
    throw new Error("Invalid message format: message must be an object");
  }

  if (!message.role || typeof message.role !== "string") {
    logger.warn("Invalid message role:", message.role);
    throw new Error("Invalid message format: role must be a string");
  }

  if (!Array.isArray(message.parts)) {
    logger.warn("Invalid message parts:", message.parts);
    throw new Error("Invalid message format: parts must be an array");
  }

  // Convert role to supported type with safe default
  let role: "user" | "assistant" | "system" | "data" = "user";
  if (message.role === "tool" || message.role === "function") {
    role = "data";
  } else if (message.role === "assistant" || message.role === "system") {
    role = message.role;
  }

  // Ensure parts is an array and safely convert each part
  const parts = message.parts
    .filter(
      (part): part is MessagePart =>
        part !== null &&
        typeof part === "object" &&
        (typeof part.text === "string" ||
          typeof part.image_url === "string" ||
          typeof part.file_url === "string"),
    )
    .map((part) => {
      try {
        const text = part.text || part.image_url || part.file_url || "";

        if (!text) {
          logger.warn("Invalid message part: missing content", part);
          throw new Error(
            "Invalid message part: must have text, image_url, or file_url",
          );
        }

        return {
          type: "text" as const,
          text,
        };
      } catch (error) {
        logger.warn("Error converting message part:", error);
        throw error;
      }
    });

  if (parts.length === 0) {
    logger.warn("No valid parts found in message");
    throw new Error("Invalid message format: no valid parts found");
  }

  // Create the message object with safe defaults
  const result: Message = {
    id: typeof message.id === "string" ? message.id : "",
    content: "",
    role,
    parts,
  };

  // Safely add attachments if present
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    try {
      result.experimental_attachments = message.attachments
        .filter(
          (attachment): attachment is NonNullable<typeof attachment> =>
            attachment !== null &&
            typeof attachment === "object" &&
            ("type" in attachment || "content" in attachment),
        )
        .map((attachment) => {
          if (!attachment.type && !attachment.content) {
            logger.warn(
              "Invalid attachment: missing type and content",
              attachment,
            );
            throw new Error(
              "Invalid attachment: must have either type or content",
            );
          }

          return {
            name:
              typeof attachment.type === "string" ? attachment.type : "unknown",
            contentType:
              typeof attachment.content === "string"
                ? "text/plain"
                : "application/json",
            url:
              typeof attachment.content === "string"
                ? attachment.content
                : JSON.stringify(attachment.content || {}),
          };
        });
    } catch (error) {
      logger.warn("Error processing attachments:", error);
      throw error;
    }
  }

  return result;
}

export function extractInProgressToolPart(
  messages: Message[],
): ToolInvocationUIPart | null {
  if (!messages || !Array.isArray(messages)) return null;

  for (const message of messages) {
    if (!message.parts || !Array.isArray(message.parts)) continue;

    for (const part of message.parts) {
      if (!part || typeof part !== "object") continue;
      if (part.type !== "tool-invocation") continue;

      const toolPart = part as ToolInvocationUIPart;
      if (toolPart.toolInvocation?.state === "result") continue;

      return toolPart;
    }
  }
  return null;
}

export function assignToolResult(toolPart: ToolInvocationUIPart, result: any) {
  if (!toolPart || !toolPart.toolInvocation) return toolPart;

  return {
    ...toolPart,
    toolInvocation: {
      ...toolPart.toolInvocation,
      state: "result",
      result: result || null,
    },
  };
}

export function isUserMessage(message: Message): boolean {
  return message?.role === "user";
}

export function filterMcpServerCustomizations(
  tools: Record<string, VercelAIMcpTool>,
  mcpServerCustomization: Record<string, McpServerCustomizationsPrompt>,
): Record<string, McpServerCustomizationsPrompt> {
  const toolNamesByServerId = Object.values(tools).reduce(
    (acc, tool) => {
      if (!acc[tool._mcpServerId]) acc[tool._mcpServerId] = [];
      acc[tool._mcpServerId].push(tool._originToolName);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  return Object.entries(mcpServerCustomization).reduce(
    (acc, [serverId, mcpServerCustomization]) => {
      if (!(serverId in toolNamesByServerId)) return acc;

      if (
        !mcpServerCustomization.prompt &&
        !Object.keys(mcpServerCustomization.tools ?? {}).length
      )
        return acc;

      const prompts: McpServerCustomizationsPrompt = {
        id: serverId,
        name: mcpServerCustomization.name,
        prompt: mcpServerCustomization.prompt,
        tools: mcpServerCustomization.tools
          ? objectFlow(mcpServerCustomization.tools).filter((_, key) => {
              return toolNamesByServerId[serverId].includes(key as string);
            })
          : {},
      };

      acc[serverId] = prompts;

      return acc;
    },
    {} as Record<string, McpServerCustomizationsPrompt>,
  );
}
