"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptTutorInvite } from "@/app/[lang]/student/_social/tutor-actions";

/** Accept a tutor's invite as the signed-in student, then go to My tutor. */
export function AcceptInvite({ token, onDone }: { token: string; onDone?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptTutorInvite(token);
            if (!r.ok) return setError(r.error);
            onDone?.();
            router.push("/student/tutor");
          })
        }
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-ink px-5 font-medium text-paper disabled:opacity-50"
      >
        {pending ? "Linking…" : "Accept and link"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-pen">
          {error}
        </p>
      )}
    </div>
  );
}
