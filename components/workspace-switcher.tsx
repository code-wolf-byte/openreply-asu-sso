"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

export interface WorkspaceOption {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
}

interface WorkspaceSwitcherProps {
  activeWorkspaceId: string;
  workspaces: WorkspaceOption[];
}

export default function WorkspaceSwitcher({
  activeWorkspaceId,
  workspaces,
}: WorkspaceSwitcherProps) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function switchWorkspace(workspaceId: string) {
    setPending(true);
    setFailed(false);
    const response = await fetch("/api/workspace/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    }).catch(() => null);

    if (!response?.ok) {
      setPending(false);
      setFailed(true);
      return;
    }

    // Cached inbox and post data belongs to the previous workspace's accounts.
    try {
      window.sessionStorage.clear();
    } catch {
      // Storage unavailable; nothing cached to clear.
    }
    // The current page may be a campaign from the old workspace, so start
    // over from the dashboard with a full load rather than a client refresh.
    window.location.assign("/dashboard");
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs text-muted" htmlFor="workspace-switcher">
        {t("Workspace")}
      </label>
      <select
        id="workspace-switcher"
        value={activeWorkspaceId}
        disabled={pending}
        aria-busy={pending}
        onChange={(event) => void switchWorkspace(event.target.value)}
        className="min-h-9 w-full truncate rounded border border-border bg-surface px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {failed && (
        <p role="alert" className="text-xs text-error">
          {t("Could not switch workspace. Please try again.")}
        </p>
      )}
    </div>
  );
}
