import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Join Edumi",
  description:
    "Set a study goal with your friends. Every minute counts for the group. Quiz yourself, level up, and get help when you're stuck.",
};

export default async function JoinPage({
  searchParams,
}: PageProps<"/[lang]/join">) {
  const locale = await getLocale();
  return (
    <div className="theme-tiles flex flex-1 flex-col">
      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12"
        lang="en"
      >
        <Link
          href={localizePath("/", locale)}
          className="text-ink no-underline"
          aria-label="Edumi home"
        >
          <Wordmark className="text-base" />
        </Link>
        <Suspense
          fallback={
            <div className="h-96 animate-pulse rounded-lg bg-paper-deep" />
          }
        >
          <JoinCard searchParams={searchParams} locale={locale} />
        </Suspense>
      </main>
    </div>
  );
}

async function JoinCard({
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/join">, "searchParams"> & {
  locale: Awaited<ReturnType<typeof getLocale>>;
}) {
  const query = await searchParams;
  const invite =
    typeof query.code === "string" && /^[A-Za-z0-9]{8,16}$/.test(query.code)
      ? query.code
      : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          {invite
            ? "You've been invited to a study group"
            : "Study with your friends"}
        </CardTitle>
        <CardDescription>
          Set a goal together, count every minute, quiz yourself and ask for
          help when you&apos;re stuck. For students 13 and over.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <JoinForm
          invite={invite}
          lang={locale}
          privacyHref={localizePath("/legal/privacy", locale)}
        />
        <p className="text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href={localizePath("/login", locale)}>Log in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
