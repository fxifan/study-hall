import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getCurrentProfile } from "@/lib/auth";
import { findInvite } from "@/lib/tutor/links";
import { continueWithInvite } from "../actions";
import { AcceptInvite } from "./accept";

export const metadata: Metadata = { title: "Link with your tutor", robots: { index: false } };

/** A tutor's invite link (docs/tutor-next-steps.md): what the tutor will see, then accept. */
export default function LinkPage({ params }: PageProps<"/[lang]/link/[token]">) {
  return (
    <div className="theme-tiles flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12" lang="en">
        <Wordmark className="text-base" />
        <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-paper-deep" />}>
          <Invite params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Invite({ params }: Pick<PageProps<"/[lang]/link/[token]">, "params">) {
  const [{ token }, profile, locale] = await Promise.all([params, getCurrentProfile(), getLocale()]);
  const invite = await findInvite(token);
  if (!invite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            <h1>This invite has expired</h1>
          </CardTitle>
          <CardDescription>It may have been used already. Ask your tutor to send you a new link.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          <h1>{invite.tutorName} invited you to Edumi</h1>
        </CardTitle>
        <CardDescription>See the next step from each lesson when you sit down to study, and tell {invite.tutorName} how you went.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="rounded-lg bg-paper-deep p-3">
          <p className="font-medium">{invite.tutorName} will see</p>
          <p className="text-ink-soft">The next steps they set you, how far you got, and anything you write about where you got stuck.</p>
          <p className="mt-2 font-medium">They won&apos;t see</p>
          <p className="text-ink-soft">Your study time, groups, chats, friends or practice.</p>
        </div>
        <p className="text-ink-soft">Your tutor&apos;s next steps and the study timer are free. Groups, friends and AI practice need a plan after the 7-day free trial. You can unlink any time.</p>
        {profile?.role === "student" ? (
          <AcceptInvite token={token} />
        ) : profile ? (
          <p className="text-pen">You&apos;re signed in as a {profile.role}. Log out, then open this link again with your student account.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <form action={continueWithInvite}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="to" value="join" />
              <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-full bg-ink px-5 font-medium text-paper">
                Create a free account
              </button>
            </form>
            <form action={continueWithInvite}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="to" value="login" />
              <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-full border border-rule px-5 font-medium">
                I already have an account
              </button>
            </form>
            <p className="text-xs text-ink-faint">
              For students 13 and over. <Link href={localizePath("/legal/privacy", locale)}>Privacy</Link>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
