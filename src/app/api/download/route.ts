import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tempFileRepository } from "@/lib/db/pg/repositories/temp-file-repository.pg";
// Import du service de nettoyage pour démarrer automatiquement
import "@/lib/temp-file-cleanup";
import { getMockSession } from "@/lib/auth/mock-session";

export async function POST(request: NextRequest) {
  try {
    const { content, filename, encoding } = await request.json();

    if (!content || !filename) {
      return NextResponse.json(
        { error: "Content and filename are required" },
        { status: 400 },
      );
    }

    // Get user (mocked for now)
    const session = getMockSession();
    const userId = session.user.id;

    // Generate unique ID for this download
    const downloadId = randomUUID();

    // Determine file path
    const tempDir = process.env.NODE_ENV === "production" ? "/tmp" : "./tmp";
    const filePath = join(tempDir, `${downloadId}-${filename}`);

    // Create directory if it doesn't exist
    const { execSync } = await import("child_process");
    execSync(`mkdir -p "${tempDir}"`, { stdio: "ignore" });

    // Write file content based on encoding
    let fileContent: Buffer;
    if (encoding === "base64") {
      // Handle base64 encoded content (from Python servers for binary files)
      fileContent = Buffer.from(content, "base64");
    } else if (typeof content === "string") {
      // Handle text content (CSV, HTML, etc.)
      fileContent = Buffer.from(content, "utf8");
    } else {
      // Handle binary content (direct buffer)
      fileContent = Buffer.from(content);
    }

    await writeFile(filePath, fileContent);
    console.log(`Created file: ${filePath} (${fileContent.length} bytes)`);

    // Store metadata in database (expires in 1 hour)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await tempFileRepository.createTempFile({
      id: downloadId,
      filename,
      filePath,
      expiresAt,
      userId,
    });

    console.log(`Stored file metadata for ID: ${downloadId}`);
    const allFiles = await tempFileRepository.getAllTempFiles();
    console.log(`Total files in storage: ${allFiles.length}`);

    // Return download URL with Railway auto-detection
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.NEXTAUTH_URL
        ? process.env.NEXTAUTH_URL
        : process.env.NODE_ENV === "production"
          ? "https://sara-lakayai-new.up.railway.app" // Update with your actual Railway URL
          : "http://localhost:3000";

    const downloadUrl = `${baseUrl}/api/download/${downloadId}`;

    return NextResponse.json({
      success: true,
      downloadId,
      downloadUrl,
      filename,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Download API Error:", error);
    return NextResponse.json(
      { error: "Failed to prepare download" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Upload file content via POST to get download link",
    usage: {
      method: "POST",
      body: {
        content: "string | buffer",
        filename: "string",
        mimeType: "string (optional)",
      },
    },
  });
}
