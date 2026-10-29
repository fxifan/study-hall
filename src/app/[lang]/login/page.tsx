import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { getDictionary, getLocale } from "@/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).login.title };
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex items-baseline justify-between gap-4">
        <Link href={localizePath("/", locale)} className="font-mono text-xs tracking-widest text-pen uppercase">
          Study Hall
        </Link>
        <LanguageSwitch locale={locale} className="text-sm text-ink-soft underline-offset-4 hover:underline" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t.login.title}</CardTitle>
          <CardDescription>{t.login.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense fallback={null}>
            <LinkError searchParams={searchParams} messages={t.login.linkErrors} />
          </Suspense>
          <LoginForm t={t.login} />
        </CardContent>
      </Card>
    </main>
  );
}

async function LinkError({
  searchParams,
  messages,
}: Pick<PageProps<"/[lang]/login">, "searchParams"> & { messages: Dictionary["login"]["linkErrors"] }) {
  const { error } = await searchParams;
  const message = typeof error === "string" && error in messages ? messages[error as keyof typeof messages] : undefined;
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-pen-faint px-3 py-2 text-sm text-pen">
      {message}
    </p>
  );
}
