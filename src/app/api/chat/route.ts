import {
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
  formatDataStreamPart,
  appendClientMessage,
  Message,
} from "ai";

import { customModelProvider, isToolCallUnsupportedModel } from "lib/ai/models";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { chatRepository } from "lib/db/repository";
import logger from "logger";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildProjectInstructionsSystemPrompt,
  buildUserSystemPrompt,
} from "lib/ai/prompts";
import {
  chatApiSchemaRequestBodySchema,
  ChatMention,
  ChatMessageAnnotation,
} from "app-types/chat";

import { errorIf, safe } from "ts-safe";

import {
  excludeToolExecution,
  filterToolsByMentions,
  handleError,
  manualToolExecuteByLastMessage,
  mergeSystemPrompt,
  convertToMessage,
  extractInProgressToolPart,
  assignToolResult,
  isUserMessage,
  getAllowedDefaultToolkit,
  filterToolsByAllowedMCPServers,
  filterMcpServerCustomizations,
} from "./helper";
import {
  generateTitleFromUserMessageAction,
  rememberMcpServerCustomizationsAction,
} from "./actions";
import { getMockSession } from "lib/auth/mock-session";

// Timeout pour les opérations asynchrones (30 secondes)
const OPERATION_TIMEOUT = 30000;

// Helper pour ajouter un timeout à une promesse
const withTimeout = (
  promise: Promise<any>,
  ms: number,
  errorMessage: string,
) => {
  let timeoutHandle: NodeJS.Timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Operation timed out: ${errorMessage}`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeoutHandle),
  );
};

export async function POST(request: Request) {
  const controller = new AbortController();

  try {
    const json = await request.json().catch((error) => {
      throw {
        status: 400,
        message: "Invalid JSON in request body",
        error,
      };
    });

    const session = getMockSession();

    if (!session?.user.id) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "You must be logged in to use this feature",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Parse and validate request body
    try {
      const {
        id,
        message,
        chatModel,
        toolChoice,
        allowedAppDefaultToolkit,
        allowedMcpServers,
        projectId,
      } = chatApiSchemaRequestBodySchema.parse(json);

      // Validate message structure before processing
      if (!message || typeof message !== "object") {
        return new Response(
          JSON.stringify({
            error: "Invalid message format",
            message: "Message must be a valid object",
            details: "The message property is missing or invalid",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (!message.role || typeof message.role !== "string") {
        return new Response(
          JSON.stringify({
            error: "Invalid message format",
            message: "Message role must be a string",
            details: "The role property is missing or invalid",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (!Array.isArray(message.parts)) {
        return new Response(
          JSON.stringify({
            error: "Invalid message format",
            message: "Message parts must be an array",
            details: "The parts property must be a valid array",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Validate each part has required properties
      const invalidPart = message.parts.find(
        (part) => !part || typeof part !== "object" || !("type" in part),
      );
      if (invalidPart) {
        return new Response(
          JSON.stringify({
            error: "Invalid message format",
            message: "Each message part must be an object with a type property",
            details: "Found an invalid message part in the array",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const model = customModelProvider.getModel(chatModel);

      // Wrap database operations in try-catch
      let thread;
      try {
        thread = await withTimeout(
          chatRepository.selectThreadDetails(id),
          OPERATION_TIMEOUT,
          "Thread retrieval timeout",
        );

        if (!thread) {
          const title = await withTimeout(
            generateTitleFromUserMessageAction({
              message: message || { role: "user", content: "", parts: [] },
              model,
            }),
            OPERATION_TIMEOUT,
            "Title generation timeout",
          );

          const newThread = await withTimeout(
            chatRepository.insertThread({
              id,
              projectId: projectId ?? null,
              title,
              userId: session.user.id,
            }),
            OPERATION_TIMEOUT,
            "Thread creation timeout",
          );

          thread = await withTimeout(
            chatRepository.selectThreadDetails(newThread.id),
            OPERATION_TIMEOUT,
            "New thread retrieval timeout",
          );
        }
      } catch (error) {
        logger.error("Database operation failed:", error);
        throw {
          status: 503,
          message: "Database operation failed",
          error,
        };
      }

      if (!thread) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Thread not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (thread.userId !== session.user.id) {
        const access = await withTimeout(
          chatRepository.selectThreadAccess(id, session.user.id),
          OPERATION_TIMEOUT,
          "Thread access check timeout",
        );
        if (!access) {
          return new Response(
            JSON.stringify({
              error: "Forbidden",
              message: "You do not have access to this thread",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }

      // if is false, it means the last message is manual tool execution
      const isLastMessageUserMessage = isUserMessage(message);

      const previousMessages = (thread?.messages ?? [])
        .filter((msg) => msg && typeof msg === "object") // Filter out invalid messages
        .map((msg) => convertToMessage(msg));

      // Safely handle annotations with proper typing
      const messageAnnotations = message?.annotations as
        | ChatMessageAnnotation[]
        | undefined;
      const annotations = Array.isArray(messageAnnotations)
        ? messageAnnotations.filter(
            (a): a is ChatMessageAnnotation =>
              a && typeof a === "object" && "mentions" in a,
          )
        : [];

      const mcpTools = mcpClientsManager.tools();

      const mentions = annotations
        .flatMap((annotation) =>
          Array.isArray(annotation.mentions) ? annotation.mentions : [],
        )
        .filter(
          (mention): mention is ChatMention =>
            mention &&
            typeof mention === "object" &&
            "type" in mention &&
            (mention.type === "tool" || mention.type === "mcpServer"),
        );

      const isToolCallAllowed =
        (!isToolCallUnsupportedModel(model) && toolChoice !== "none") ||
        mentions.length > 0;

      const tools = safe(mcpTools)
        .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
        .map((tools) => {
          // filter tools by mentions
          if (mentions.length) {
            return filterToolsByMentions(tools, mentions);
          }
          // filter tools by allowed mcp servers
          return filterToolsByAllowedMCPServers(tools, allowedMcpServers);
        })
        .orElse(undefined);

      const messages: Message[] =
        isLastMessageUserMessage && message
          ? appendClientMessage({
              messages: previousMessages,
              message,
            })
          : previousMessages;

      return createDataStreamResponse({
        execute: async (dataStream) => {
          try {
            const inProgressToolStep = extractInProgressToolPart(
              messages.slice(-2),
            );

            if (inProgressToolStep) {
              const toolResult = await withTimeout(
                manualToolExecuteByLastMessage(
                  inProgressToolStep,
                  message,
                  mcpTools,
                ),
                OPERATION_TIMEOUT,
                "Tool execution timeout",
              );

              if (toolResult) {
                assignToolResult(inProgressToolStep, toolResult);
                dataStream.write(
                  formatDataStreamPart("tool_result", {
                    toolCallId: inProgressToolStep.toolInvocation?.toolCallId,
                    result: toolResult,
                  }),
                );
              }
            }

            const userPreferences = thread?.userPreferences;

            const mcpServerCustomizations = await safe()
              .map(() => {
                if (!tools || Object.keys(tools).length === 0)
                  throw new Error("No tools found");
                return rememberMcpServerCustomizationsAction(session.user.id);
              })
              .map((v) => filterMcpServerCustomizations(tools!, v))
              .orElse({});

            const systemPrompt = mergeSystemPrompt(
              buildUserSystemPrompt(session.user, userPreferences),
              buildProjectInstructionsSystemPrompt(thread?.instructions),
              buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
            );

            // Precompute toolChoice to avoid repeated tool calls
            const computedToolChoice =
              isToolCallAllowed && mentions.length > 0 && inProgressToolStep
                ? "required"
                : "auto";

            const vercelAITools = safe(tools)
              .map((t) => {
                if (!t) return undefined;
                const bindingTools =
                  toolChoice === "manual" ? excludeToolExecution(t) : t;

                return {
                  ...getAllowedDefaultToolkit(allowedAppDefaultToolkit),
                  ...bindingTools,
                };
              })
              .unwrap();

            const result = streamText({
              model,
              system: systemPrompt,
              messages,
              maxSteps: 10,
              experimental_continueSteps: true,
              experimental_transform: smoothStream({ chunking: "word" }),
              maxRetries: 2,
              tools: vercelAITools,
              toolChoice: computedToolChoice,
              onFinish: async ({ response, usage }) => {
                try {
                  const appendMessages = appendResponseMessages({
                    messages: messages.slice(-1),
                    responseMessages: response.messages,
                  });

                  if (isLastMessageUserMessage && message) {
                    await withTimeout(
                      chatRepository.insertMessage({
                        threadId: thread!.id,
                        model: chatModel?.model ?? undefined,
                        role: "user",
                        parts:
                          message.parts?.map((part) => ({
                            text: part.type === "text" ? part.text : "",
                          })) || [],
                        attachments: message.experimental_attachments?.map(
                          (attachment) => ({
                            type: attachment.name || "unknown",
                            content: attachment.url || "",
                          }),
                        ),
                        id: message.id,
                        annotations: [
                          {
                            type: "usage",
                            text: "Usage tokens",
                            attributes: {
                              usageTokens: usage.promptTokens,
                            },
                          },
                        ],
                        userId: session.user.id,
                      }),
                      OPERATION_TIMEOUT,
                      "Message insertion timeout",
                    );
                  }

                  const assistantMessage = appendMessages.at(-1);
                  if (assistantMessage) {
                    const annotations = [
                      {
                        type: "usage",
                        text: "Usage tokens",
                        attributes: {
                          usageTokens: usage.completionTokens,
                          toolChoice,
                        },
                      },
                    ];
                    dataStream.writeMessageAnnotation(annotations[0]);

                    await withTimeout(
                      chatRepository.upsertMessage({
                        model: chatModel?.model ?? undefined,
                        threadId: thread!.id,
                        role:
                          assistantMessage.role === "data"
                            ? "tool"
                            : assistantMessage.role,
                        id: assistantMessage.id,
                        parts: (assistantMessage.parts || []).map((part) => ({
                          text: part.type === "text" ? part.text : "",
                        })),
                        attachments:
                          assistantMessage.experimental_attachments?.map(
                            (attachment) => ({
                              type: attachment.name || "unknown",
                              content: attachment.url || "",
                            }),
                          ),
                        annotations,
                        userId: session.user.id,
                      }),
                      OPERATION_TIMEOUT,
                      "Assistant message update timeout",
                    );
                  }
                } catch (error) {
                  logger.error("Error in onFinish:", error);
                  throw error;
                }
              },
            });

            result.consumeStream();
            result.mergeIntoDataStream(dataStream, {
              sendReasoning: true,
            });
          } catch (error) {
            logger.error("Error in execute:", error);
            controller.abort();
            throw error;
          }
        },
        onError: (error: unknown): string => {
          logger.error("Stream error:", error);
          controller.abort();
          const errorResult = handleError(error);
          return typeof errorResult === "string"
            ? errorResult
            : JSON.stringify(errorResult);
        },
      });
    } catch (validationError: any) {
      logger.error("Validation error:", validationError);
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid input provided. Please check your request.",
          details: validationError?.message || "Unknown validation error",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error: any) {
    logger.error("Route error:", error);
    controller.abort();

    const errorResponse = handleError(error);
    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.status || 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
