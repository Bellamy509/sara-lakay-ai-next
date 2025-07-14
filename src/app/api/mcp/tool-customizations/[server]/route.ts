// import { getSession } from "auth/server";
import { getMockSession } from "lib/auth/mock-session";
import { mcpMcpToolCustomizationRepository } from "lib/db/repository";

import { NextResponse } from "next/server";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ server: string }> },
) {
  const { server } = await params;
  const session = await getMockSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const mcpServerCustomization =
    await mcpMcpToolCustomizationRepository.selectByUserIdAndMcpServerId({
      mcpServerId: server,
      userId: session.user.id,
    });

  return NextResponse.json(mcpServerCustomization);
}
