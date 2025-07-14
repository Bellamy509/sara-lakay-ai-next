import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import { tempFileRepository } from "@/lib/db/pg/repositories/temp-file-repository.pg";
import { getMockSession } from "@/lib/auth/mock-session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const downloadId = resolvedParams.id;

    // Get user (mocked for now)
    const session = getMockSession();
    const userId = session.user.id;

    console.log(`Download request for ID: ${downloadId}`);
    const allFiles = await tempFileRepository.getAllTempFiles();
    console.log(`Available file IDs: ${allFiles.map((f) => f.id).join(", ")}`);

    if (!downloadId) {
      console.error("No download ID provided");
      return NextResponse.json(
        { error: "Download ID is required" },
        { status: 400 },
      );
    }

    // Get file metadata from database (and check user)
    const fileData = await tempFileRepository.getTempFile(downloadId, userId);

    if (!fileData) {
      console.error(`File not found or not authorized for ID: ${downloadId}`);
      console.log(`Current tempFiles size: ${allFiles.length}`);
      return NextResponse.json(
        { error: "File not found, expired, or not authorized" },
        { status: 404 },
      );
    }

    console.log(`Found file: ${fileData.filename} at ${fileData.filePath}`);

    // Check if file is expired
    if (new Date() > fileData.expiresAt) {
      // Cleanup expired file
      unlink(fileData.filePath).catch(() => {});
      await tempFileRepository.deleteTempFile(downloadId);

      return NextResponse.json({ error: "File has expired" }, { status: 410 });
    }

    try {
      // Read file content
      const fileContent = await readFile(fileData.filePath);

      // Determine content type based on file extension
      const ext = fileData.filename.split(".").pop()?.toLowerCase();
      let contentType = "application/octet-stream";

      switch (ext) {
        case "csv":
          contentType = "text/csv";
          break;
        case "html":
          contentType = "text/html";
          break;
        case "pdf":
          contentType = "application/pdf";
          break;
        case "xlsx":
          contentType =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          break;
        case "pptx":
          contentType =
            "application/vnd.openxmlformats-officedocument.presentationml.presentation";
          break;
        case "txt":
          contentType = "text/plain";
          break;
      }

      // Create response with file
      const response = new NextResponse(fileContent, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${fileData.filename}"`,
          "Content-Length": fileContent.length.toString(),
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });

      // Cleanup file after serving (optional - you might want to keep it for a while)
      setTimeout(async () => {
        unlink(fileData.filePath).catch(() => {});
        await tempFileRepository.deleteTempFile(downloadId);
      }, 1000); // Wait 1 second before cleanup

      return response;
    } catch (fileError) {
      console.error("File read error:", fileError);

      // Cleanup invalid file reference
      await tempFileRepository.deleteTempFile(downloadId);

      return NextResponse.json(
        { error: "File could not be read" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Download API Error:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
