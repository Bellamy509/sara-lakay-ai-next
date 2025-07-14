import { NextRequest } from "next/server";
import { getSession } from "lib/auth/server";
import { toolAccessRepository } from "lib/db/pg/repositories/tool-access-repository.pg";

const GOOGLE_OAUTH_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/tasks",
  ],
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const toolId = searchParams.get("toolId");
  const serverId = searchParams.get("serverId");

  if (!code || !toolId || !serverId) {
    return new Response("Missing required parameters", { status: 400 });
  }

  try {
    // Échanger le code contre des tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_OAUTH_CONFIG.clientId,
        client_secret: GOOGLE_OAUTH_CONFIG.clientSecret,
        redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for tokens");
    }

    const tokens = await tokenResponse.json();

    // Sauvegarder les tokens dans la base de données
    await toolAccessRepository.insertAccess({
      userId: session.user.id,
      toolId,
      serverId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });

    // Rediriger vers la page de succès
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/chat/mcp/test?success=true",
      },
    });
  } catch (error) {
    console.error("OAuth error:", error);
    return new Response("OAuth error", { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { toolId, serverId } = await request.json();

    if (!toolId || !serverId) {
      return new Response("Missing toolId or serverId", { status: 400 });
    }

    // Générer l'URL d'autorisation
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_OAUTH_CONFIG.clientId);
    authUrl.searchParams.set("redirect_uri", GOOGLE_OAUTH_CONFIG.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_OAUTH_CONFIG.scopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", JSON.stringify({ toolId, serverId }));

    return Response.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error("Failed to generate auth URL:", error);
    return new Response("Server error", { status: 500 });
  }
}

// Route pour rafraîchir un token expiré
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { toolId, serverId } = await request.json();

    if (!toolId || !serverId) {
      return new Response("Missing toolId or serverId", { status: 400 });
    }

    // Récupérer l'accès actuel
    const access = await toolAccessRepository.getAccess(
      session.user.id,
      toolId,
      serverId,
    );
    if (!access || !access.refreshToken) {
      return new Response("No refresh token found", { status: 404 });
    }

    // Rafraîchir le token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: access.refreshToken,
        client_id: GOOGLE_OAUTH_CONFIG.clientId,
        client_secret: GOOGLE_OAUTH_CONFIG.clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to refresh token");
    }

    const tokens = await tokenResponse.json();

    // Mettre à jour les tokens dans la base de données
    const updatedAccess = await toolAccessRepository.updateAccess(access.id, {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });

    return Response.json(updatedAccess);
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return new Response("Server error", { status: 500 });
  }
}
