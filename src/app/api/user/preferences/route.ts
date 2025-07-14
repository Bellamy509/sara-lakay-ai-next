// import { getSession } from "auth/server";
import { getMockSession } from "lib/auth/mock-session";
import { UserPreferencesZodSchema } from "app-types/user";
import { userRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export async function GET() {
  // const session = await getSession();
  const session = getMockSession();

  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preferences = await userRepository.getPreferences(session.user.id);

  return NextResponse.json({
    preferences: preferences || {},
  });
}

export async function PUT(request: Request) {
  // const session = await getSession();
  const session = getMockSession();

  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const preferences = UserPreferencesZodSchema.parse(json);
  const updatedUser = await userRepository.updatePreferences(
    session.user.id,
    preferences,
  );
  return NextResponse.json({
    success: true,
    preferences: updatedUser.preferences,
  });
}
