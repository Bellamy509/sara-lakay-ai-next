import { convertToCoreMessages, smoothStream, streamText } from "ai";
import { selectThreadWithMessagesAction } from "../actions";
import { customModelProvider } from "lib/ai/models";
import { SUMMARIZE_PROMPT } from "lib/ai/prompts";
import logger from "logger";
import { ChatModel } from "app-types/chat";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { threadId, chatModel } = json as {
      threadId: string;
      chatModel?: ChatModel;
    };

    const thread = await selectThreadWithMessagesAction(threadId);

    if (!thread) {
      return new Response("Thread not found", { status: 404 });
    }

    const messages = convertToCoreMessages(
      thread.messages
        .map((v) => {
          let role: "user" | "assistant" | "system" | "data";
          if (v.role === "tool" || v.role === "function") {
            role = "data";
          } else {
            role = v.role;
          }
          return {
            content: "",
            role,
            parts: v.parts.map((part) => ({
              type: "text" as const,
              text: part.text || part.image_url || part.file_url || "",
            })),
          };
        })
        .concat({
          content: "",
          parts: [
            {
              type: "text" as const,
              text: "Generate a system prompt based on the conversation so far according to the rules.",
            },
          ],
          role: "user",
        }),
    );

    const result = streamText({
      model: customModelProvider.getModel(chatModel),
      system: SUMMARIZE_PROMPT,
      experimental_transform: smoothStream({ chunking: "word" }),
      messages,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    logger.error(error);
  }
}
