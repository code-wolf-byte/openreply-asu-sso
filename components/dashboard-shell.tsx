"use client";

import { useState } from "react";
import { AsuHeader, AsuHeaderSpacer } from "@/components/asu-chrome";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/top-bar";
import type { WorkspaceOption } from "@/components/workspace-switcher";

interface DashboardShellProps {
  children: React.ReactNode;
  userName: string | null;
  workspaceName: string;
  activeWorkspaceId: string;
  workspaces: WorkspaceOption[];
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function DashboardShell({
  children,
  userName,
  workspaceName,
  activeWorkspaceId,
  workspaces,
  instagramUsername,
  instagramAccountCount,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    // h-dvh, not h-screen: on mobile browsers the URL bar eats into 100vh, which
    // would push the composer and pagination controls below the fold.
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* The ASU header is position: fixed; the spacer keeps the app below it. */}
      <AsuHeader userName={userName} />
      <AsuHeaderSpacer />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userName={userName}
          workspaceName={workspaceName}
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar
            onMenuClick={() => setSidebarOpen(true)}
            instagramUsername={instagramUsername}
            instagramAccountCount={instagramAccountCount}
          />

          {/* overflow-x-hidden: enabling vertical scrolling makes the browser
              allow horizontal scrolling too, which lets a wide child drag the
              whole page sideways on a phone. */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="px-4 lg:px-8 py-5 sm:py-6 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
