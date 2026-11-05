"use client";

/**
 * Sidebar Navigation
 *
 * Grouped nav with Font Awesome icons and a maroon active state, styled
 * after forklift's admin sidebar, with the workspace section underneath.
 */

import LanguageSwitcher from "@/components/language-switcher";
import WorkspaceSwitcher, { type WorkspaceOption } from "@/components/workspace-switcher";
import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navSections: Array<{
  label: StaticMessageKey;
  items: Array<{ label: StaticMessageKey; href: string; icon: string }>;
}> = [
  {
    label: "General",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "fa-chart-bar" },
      { label: "Overview", href: "/overview", icon: "fa-chart-line" },
    ],
  },
  {
    label: "Messaging",
    items: [
      { label: "Inbox", href: "/inbox", icon: "fa-inbox" },
      { label: "Campaigns", href: "/campaigns", icon: "fa-bullhorn" },
      { label: "DM Logs", href: "/logs", icon: "fa-comments" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", href: "/settings", icon: "fa-sliders-h" },
      { label: "API & MCP", href: "/integrations", icon: "fa-plug" },
      { label: "Diagnostics", href: "/diagnostics", icon: "fa-stethoscope" },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string | null;
  workspaceName: string;
  activeWorkspaceId: string;
  workspaces: WorkspaceOption[];
}

export default function Sidebar({
  isOpen,
  onClose,
  userName,
  workspaceName,
  activeWorkspaceId,
  workspaces,
}: SidebarProps) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay. Above the ASU header (z-index 1031) so the drawer
          is not tucked under it. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[1090] bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-[1100] h-dvh w-60 max-w-[85vw] shrink-0 overflow-hidden bg-surface border-r border-border flex flex-col
          transition-transform duration-200 ease-out
          lg:h-full lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Full height on mobile, so the heading would otherwise land under
            the status bar when installed. */}
        <div
          className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border text-sm font-bold uppercase tracking-wider"
          style={{ paddingTop: "calc(0.875rem + env(safe-area-inset-top))" }}
        >
          <i className="fas fa-comment-dots text-accent" aria-hidden="true" />
          <Link href="/dashboard" onClick={onClose}>
            OpenReply
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto pb-2">
          {navSections.map((section) => (
            <div key={section.label} className="px-2 pt-4 pb-1">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                {t(section.label)}
              </p>
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? "page" : undefined}
                    className={`
                      mb-px flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[15px] transition-colors
                      ${
                        isActive
                          ? "bg-accent/10 text-accent font-semibold"
                          : "font-medium text-foreground/70 hover:bg-accent/5 hover:text-foreground"
                      }
                    `}
                  >
                    <span className="w-[18px] shrink-0 text-center" aria-hidden="true">
                      <i className={`fas ${item.icon}`} />
                    </span>
                    {t(item.label)}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-border px-4 py-3">
          {workspaces.length > 1 ? (
            <WorkspaceSwitcher
              activeWorkspaceId={activeWorkspaceId}
              workspaces={workspaces}
            />
          ) : (
            <p className="truncate text-sm font-semibold text-foreground">{workspaceName}</p>
          )}
          {userName && <p className="truncate text-xs text-muted">{userName}</p>}
          {/* The switcher's select is wider than the 240px sidebar at its
              natural size; let it shrink instead of overhanging the edge. */}
          <div className="min-w-0 [&_select]:min-w-0 [&_select]:max-w-full [&_label]:flex [&_label]:max-w-full">
            <LanguageSwitcher />
          </div>
        </div>
      </aside>
    </>
  );
}
