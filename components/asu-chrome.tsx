"use client";

/**
 * ASU Unity header and footer, configured the same way as forklift's
 * asu-unity-react app. The package reads window.location and injects its
 * styles at runtime, so both render on the client only.
 *
 * The package inlines its own react-dom/client (19.2.6), which throws on
 * import unless React is exactly that version; Next.js always serves its own
 * React, so it never is. patches/@asu+component-header-footer+1.4.3.patch
 * makes that copy load lazily (only initGlobalHeader/initASUFooter use it),
 * and the version is pinned so the patch keeps applying. Recheck the patch
 * before upgrading; 1.6.1 has the same problem.
 */

import dynamic from "next/dynamic";
import { useEffect, useState, type ComponentType } from "react";

// The package's main.d.ts types these as ReactNode<Props>, which is not a
// usable JSX element type, and is out of date for the footer; the props
// below are the ones forklift passes at the same version.
type UnityComponent = ComponentType<Record<string, unknown>>;

const ASUHeader = dynamic(
  () =>
    import("@asu/component-header-footer").then(
      (mod) => mod.ASUHeader as unknown as UnityComponent
    ),
  { ssr: false }
);

const ASUFooter = dynamic(
  () =>
    import("@asu/component-header-footer").then(
      (mod) => mod.ASUFooter as unknown as UnityComponent
    ),
  { ssr: false }
);

// Required prop; OpenReply is not a partner site, so a blank placeholder.
const BLANK_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const SITE = "openreply";

interface AsuHeaderProps {
  userName: string | null;
}

export function AsuHeader({ userName }: AsuHeaderProps) {
  const loggedIn = Boolean(userName);
  return (
    <ASUHeader
      logo={{
        src: "/brand/asu-logo-vertical.png",
        mobileSrc: "/brand/asu-logo-horizontal.png",
        alt: "Arizona State University logo",
        title: "ASU homepage",
        brandLink: "https://www.asu.edu",
      }}
      partnerLogo={{ src: BLANK_GIF, alt: "" }}
      title="OpenReply"
      baseUrl="/dashboard"
      navTree={[
        { id: 0, href: "/dashboard", text: "Home", type: "icon-home", class: "home" },
      ]}
      searchUrl="https://search.asu.edu/search"
      site={SITE}
      loginLink={loggedIn ? null : "/login"}
      logoutLink={loggedIn ? "/api/auth/logout" : null}
      loggedIn={loggedIn}
      userName={userName ?? ""}
      isPartner={false}
      expandOnHover={true}
      breakpoint="Lg"
    />
  );
}

export function AsuFooter() {
  return (
    <ASUFooter
      baseUrl="/"
      logo={{
        src: "/brand/asu-logo-horizontal.png",
        alt: "Arizona State University",
        brandLink: "https://www.asu.edu",
      }}
      footerLinks={[
        [
          {
            href: "https://www.asu.edu/legal/copyright-trademark",
            title: "Terms of Use",
          },
          {
            href: "https://www.asu.edu/privacy",
            title: "Privacy",
          },
        ],
      ]}
      innovation={false}
      site={SITE}
    />
  );
}

/**
 * Height of the fixed ASU header, tracked as it changes (it grows on mobile
 * when the menu opens and appears only after the client-side import), so the
 * page below can be pushed clear of it the way forklift's App does.
 */
export function useAsuHeaderHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let observer: ResizeObserver | undefined;

    const attach = () => {
      const header = document.getElementById("asuHeader");
      if (!header) return false;
      setHeight(header.offsetHeight);
      observer = new ResizeObserver(() => setHeight(header.offsetHeight));
      observer.observe(header);
      return true;
    };

    if (attach()) return () => observer?.disconnect();

    // The header mounts after its dynamic import resolves.
    const mutations = new MutationObserver(() => {
      if (attach()) mutations.disconnect();
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      observer?.disconnect();
    };
  }, []);

  return height;
}

/** Reserves the space under the fixed header. */
export function AsuHeaderSpacer() {
  const height = useAsuHeaderHeight();
  return <div aria-hidden="true" style={{ height }} />;
}
