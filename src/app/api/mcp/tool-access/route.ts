import { NextRequest } from "next/server";
import { getSession } from "lib/auth/server";
import { toolAccessRepository } from "lib/db/pg/repositories/tool-access-repository.pg";
import { z } from "zod";

const ToolAccessSchema = z.object({
  toolId: z.string(),
  serverId: z.string(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();
    const data = ToolAccessSchema.parse(body);

    const access = await toolAccessRepository.insertAccess({
      userId: session.user.id,
      toolId: data.toolId,
      serverId: data.serverId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    return Response.json(access);
  } catch (error) {
    console.error("Failed to create tool access:", error);
    return new Response("Invalid request", { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const toolId = searchParams.get("toolId");
    const serverId = searchParams.get("serverId");

    if (toolId && serverId) {
      const access = await toolAccessRepository.getAccess(
        session.user.id,
        toolId,
        serverId,
      );
      if (!access) {
        return new Response("Not found", { status: 404 });
      }
      return Response.json(access);
    }

    const accesses = await toolAccessRepository.listUserAccess(session.user.id);
    return Response.json(accesses);
  } catch (error) {
    console.error("Failed to get tool access:", error);
    return new Response("Server error", { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response("Missing id parameter", { status: 400 });
    }

    await toolAccessRepository.deleteAccess(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete tool access:", error);
    return new Response("Server error", { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response("Missing id parameter", { status: 400 });
    }

    const body = await request.json();
    const data = ToolAccessSchema.partial().parse(body);

    const access = await toolAccessRepository.updateAccess(id, {
      toolId: data.toolId,
      serverId: data.serverId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    return Response.json(access);
  } catch (error) {
    console.error("Failed to update tool access:", error);
    return new Response("Invalid request", { status: 400 });
  }
}
