import { I18nProvider } from "@/lib/i18n/provider";
import { getI18n } from "@/lib/i18n/server";
import { auth } from "@/lib/auth";
import { AsuFooter, AsuHeader, AsuHeaderSpacer } from "@/components/asu-chrome";
import LanguageSwitcher from "@/components/language-switcher";

// Keep request cookies below the root layout so marketing pages stay static.
export default async function LocalizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getI18n();
  const session = await auth();
  return (
    <I18nProvider locale={locale}>
      <div className="flex min-h-dvh flex-col">
        <AsuHeader userName={session?.user?.name ?? session?.user?.email ?? null} />
        <AsuHeaderSpacer />
        <div className="flex justify-end px-5 pt-4">
          <LanguageSwitcher />
        </div>
        <div className="flex-1">{children}</div>
        <AsuFooter />
      </div>
    </I18nProvider>
  );
}
