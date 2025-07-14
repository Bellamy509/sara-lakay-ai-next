import { NextRequest } from "next/server";
// import { getSession } from "auth/server";
import { getMockSession } from "lib/auth/mock-session";
import { AllowedMCPServer, VercelAIMcpTool } from "app-types/mcp";
import { chatRepository } from "lib/db/repository";
import {
  filterMcpServerCustomizations,
  filterToolsByAllowedMCPServers,
  mergeSystemPrompt,
} from "../helper";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildProjectInstructionsSystemPrompt,
  buildSpeechSystemPrompt,
} from "lib/ai/prompts";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { errorIf, safe } from "ts-safe";
import { DEFAULT_VOICE_TOOLS } from "lib/ai/speech";
import { rememberMcpServerCustomizationsAction } from "../actions";

export async function POST(request: NextRequest) {
  try {
    // Vérification désactivée pour fonctionnement sans clé OpenAI réelle
    // if (!process.env.OPENAI_API_KEY) {
    //   return new Response(
    //     JSON.stringify({ error: "OPENAI_API_KEY is not set" }),
    //     {
    //       status: 500,
    //     },
    //   );
    // }

    // Utiliser une clé factice si aucune clé réelle n'est définie
    const openAIApiKey = process.env.OPENAI_API_KEY || "sk-fake-key-demo-only";

    // Utiliser la session mockée directement
    const session = getMockSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { voice, allowedMcpServers, toolChoice, threadId, projectId } =
      (await request.json()) as {
        model: string;
        voice: string;
        allowedMcpServers: Record<string, AllowedMCPServer>;
        toolChoice: "auto" | "none" | "manual";
        projectId?: string;
        threadId?: string;
      };

    if (threadId) {
      const thread = await chatRepository.selectThread(
        threadId,
        session.user.id,
      );
      if (!thread) {
        return new Response("Thread not found", { status: 404 });
      }
      if (thread.userId !== session.user.id) {
        const access = await chatRepository.selectThreadAccess(
          threadId,
          session.user.id,
        );
        if (!access) {
          return new Response("Forbidden", { status: 403 });
        }
      }
    }

    const mcpTools = mcpClientsManager.tools();

    const tools = safe(mcpTools)
      .map(errorIf(() => toolChoice === "none" && "Not allowed"))
      .map((tools) => {
        return filterToolsByAllowedMCPServers(tools, allowedMcpServers);
      })
      .orElse(undefined);

    const { instructions, userPreferences } = projectId
      ? await chatRepository.selectThreadInstructionsByProjectId(
          session.user.id,
          projectId,
        )
      : await chatRepository.selectThreadInstructions(
          session.user.id,
          threadId,
        );

    const mcpServerCustomizations = await safe()
      .map(() => {
        if (Object.keys(tools ?? {}).length === 0)
          throw new Error("No tools found");
        return rememberMcpServerCustomizationsAction(session.user.id);
      })
      .map((v) => filterMcpServerCustomizations(tools!, v))
      .orElse({});

    const openAITools = Object.entries(tools ?? {}).map(([name, tool]) => {
      return vercelAIToolToOpenAITool(tool, name);
    });

    const systemPrompt = mergeSystemPrompt(
      buildSpeechSystemPrompt(session.user, userPreferences),
      buildProjectInstructionsSystemPrompt(instructions),
      buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
    );

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: "gpt-4o-realtime-preview",
        voice: voice || "alloy",
        input_audio_transcription: {
          model: "whisper-1",
        },
        instructions: systemPrompt,
        tools: [...openAITools, ...DEFAULT_VOICE_TOOLS],
      }),
    });

    return new Response(r.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}

function vercelAIToolToOpenAITool(tool: VercelAIMcpTool, name: string) {
  return {
    name,
    type: "function",
    description: tool.description,
    parameters: tool.parameters?.jsonSchema ?? {
      type: "object",
      properties: {},
      required: [],
    },
  };
}
