import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("No access - OpenReply"),
    description: t("This OpenReply instance is invite-only."),
  };
}

/**
 * Where the dashboard sends a signed-in user who has no workspace on an
 * invite-only instance. Signing out is the only action, so they can come back
 * with the address that was invited.
 */
export default async function NoAccessPage() {
  const { t } = await getI18n();
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            OpenReply
          </h1>
        </div>

        <div className="panel rounded p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">{t("You have not been invited yet")}</h2>
          <p className="text-sm text-muted">
            {t("This instance is invite-only. Ask the person who manages your team's Instagram account to invite {email}.", {
              email: session.user.email ?? t("your account"),
            })}
          </p>
          <form action={signOutAction} className="mt-6">
            <button
              type="submit"
              className="text-sm text-accent hover:underline"
            >
              {t("Sign in with a different account")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
