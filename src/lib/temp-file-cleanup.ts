import { tempFileRepository } from "./db/pg/repositories/temp-file-repository.pg";

// Service de nettoyage automatique des fichiers temporaires expirés
class TempFileCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;

  start() {
    if (this.cleanupInterval) {
      return; // Déjà démarré
    }

    console.log("🧹 Starting temp file cleanup service...");

    // Nettoyage immédiat
    this.performCleanup();

    // Nettoyage toutes les 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.performCleanup();
      },
      5 * 60 * 1000,
    ); // 5 minutes
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log("🧹 Temp file cleanup service stopped");
    }
  }

  private async performCleanup() {
    try {
      const cleanedCount = await tempFileRepository.cleanupExpiredFiles();
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired temp files`);
      }
    } catch (error) {
      console.error("🧹 Error during temp file cleanup:", error);
    }
  }
}

export const tempFileCleanupService = new TempFileCleanupService();

// Auto-start le service dès l'import
tempFileCleanupService.start();

// Cleanup sur arrêt du processus
process.on("exit", () => {
  tempFileCleanupService.stop();
});

process.on("SIGINT", () => {
  tempFileCleanupService.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  tempFileCleanupService.stop();
  process.exit(0);
});
