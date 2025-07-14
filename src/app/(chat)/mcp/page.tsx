"use client";
import { MCPCard } from "@/components/mcp-card";
import { appStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MCPOverview } from "@/components/mcp-overview";
import { selectMcpClientsAction } from "@/app/api/mcp/actions";
import useSWR from "swr";
import { Skeleton } from "ui/skeleton";
import { useEffect, useState } from "react";

import { handleErrorWithToast } from "ui/shared-toast";
import { ScrollArea } from "ui/scroll-area";
import { useTranslations } from "next-intl";
import { MCPIcon } from "ui/mcp-icon";

export default function Page() {
  const appStoreMutate = appStore((state) => state.mutate);
  const t = useTranslations("MCP");
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const {
    data: mcpList,
    isLoading,
    error,
  } = useSWR("mcp-list", selectMcpClientsAction, {
    refreshInterval: 10000,
    fallbackData: [],
    onError: handleErrorWithToast,
    onSuccess: (data) => {
      console.log("🎯 MCP Page: Données reçues:", data);
      console.log("🎯 MCP Page: Nombre de serveurs:", data?.length || 0);
      appStoreMutate({ mcpList: data });
    },
  });

  // Debug: Log state changes
  useEffect(() => {
    console.log("🎯 MCP Page: État actuel:");
    console.log("  - isLoading:", isLoading);
    console.log("  - error:", error);
    console.log("  - mcpList:", mcpList);
    console.log("  - mcpList.length:", mcpList?.length);
    console.log(
      "  - Condition pour affichage:",
      mcpList?.length ? "MCPCard" : "MCPOverview",
    );
  }, [isLoading, error, mcpList]);

  // Test direct de l'action
  const handleTestDirect = async () => {
    setIsTesting(true);
    try {
      console.log("🧪 Test direct de l'action MCP...");
      const result = await selectMcpClientsAction();
      console.log("🧪 Résultat du test direct:", result);
      setTestResult(result);
    } catch (error) {
      console.error("🧪 Erreur dans le test direct:", error);
      setTestResult({
        error: error instanceof Error ? error.message : String(error),
      });
    }
    setIsTesting(false);
  };

  return (
    <ScrollArea className="h-full w-full">
      <div className="flex-1 relative flex flex-col gap-4 px-8 py-8 max-w-3xl h-full mx-auto">
        <div className="flex items-center mb-4">
          <h1 className="text-2xl font-bold">MCP Servers</h1>
          <div className="flex-1" />

          <div className="flex gap-2">
            <Button
              onClick={handleTestDirect}
              disabled={isTesting}
              variant="destructive"
              size="sm"
            >
              {isTesting ? "Test..." : "🧪 Test Direct"}
            </Button>
            <Link
              href="https://smithery.ai/"
              target="_blank"
              className="hidden sm:block"
            >
              <Button className="font-semibold" variant={"ghost"}>
                {t("marketplace")}
              </Button>
            </Link>
            <Link href="/mcp/create">
              <Button className="font-semibold bg-input/20" variant="outline">
                <MCPIcon className="fill-foreground size-3.5" />
                {t("addMcpServer")}
              </Button>
            </Link>
          </div>
        </div>

        {/* Debug info */}
        <div className="text-sm text-muted-foreground bg-secondary/20 p-3 rounded">
          <p>
            Debug: isLoading={String(isLoading)}, mcpList.length=
            {mcpList?.length || 0}
          </p>
          {error && <p>Error: {String(error)}</p>}
          <details className="mt-2">
            <summary>JSON des données SWR</summary>
            <pre className="mt-2 overflow-auto max-h-40 text-xs">
              {JSON.stringify(mcpList, null, 2)}
            </pre>
          </details>
          {testResult && (
            <details className="mt-2">
              <summary>Résultat du test direct</summary>
              <pre className="mt-2 overflow-auto max-h-40 text-xs">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-60 w-full" />
            <Skeleton className="h-60 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        ) : mcpList?.length ? (
          <div className="flex flex-col gap-6 my-4">
            {mcpList.map((mcp) => (
              <MCPCard key={mcp.id} {...mcp} />
            ))}
          </div>
        ) : (
          // When MCP list is empty
          <div className="flex flex-col gap-4">
            <MCPOverview />
            <div className="text-center text-muted-foreground">
              <p>
                Aucun serveur MCP détecté. Utilisez le bouton &ldquo;🧪 Test
                Direct&rdquo; pour diagnostiquer.
              </p>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
