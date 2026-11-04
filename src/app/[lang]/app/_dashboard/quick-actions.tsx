"use client";

import Link from "next/link";
import { useDashboard } from "./lesson-dialog";
import { primaryButton, secondaryButton } from "./ui";

export function QuickActions({ logHref, addStudentHref }: { logHref: string; addStudentHref: string }) {
  const { openCreate } = useDashboard();
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <Link href={logHref} className={`${primaryButton} col-span-2 sm:col-span-1`}>
        + Log a session
      </Link>
      <button type="button" className={secondaryButton} onClick={() => openCreate()}>
        Schedule a lesson
      </button>
      <Link href={addStudentHref} className={secondaryButton}>
        Add a student
      </Link>
      <button
        type="button"
        className={`${secondaryButton} col-span-2 sm:col-span-1`}
        onClick={() => {
          const details = document.querySelector<HTMLDetailsElement>("#meeting-links details");
          if (details) details.open = true;
          document.getElementById("new-link-url")?.focus();
        }}
      >
        Add a meeting link
      </button>
    </div>
  );
}
