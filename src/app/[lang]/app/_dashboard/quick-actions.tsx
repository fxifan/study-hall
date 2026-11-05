"use client";

import Link from "next/link";
import type { NextAction } from "@/lib/tutor/dashboard";
import { useCopyText } from "@/components/report-cards";
import { useDashboard } from "./lesson-dialog";
import { primaryButton, secondaryButton } from "./ui";

type Key = "log" | "schedule" | "student" | "link" | "invoice";

/**
 * The dashboard's actions (dashboard review §2): the one the tutor most likely needs next comes
 * first, in coral; the everyday actions stay beside it as secondary buttons.
 */
export function QuickActions({
  next,
  logHref,
  addStudentHref,
  invoicesHref,
}: {
  next: NextAction;
  logHref: string;
  addStudentHref: string;
  invoicesHref: string;
}) {
  const { openCreate } = useDashboard();
  const [copyState, copy] = useCopyText();

  const focusLinks = () => {
    const details = document.querySelector<HTMLDetailsElement>("#meeting-links details");
    if (details) details.open = true;
    document.getElementById("new-link-url")?.focus();
  };

  const secondary: Record<Key, React.ReactNode> = {
    log: (
      <Link key="log" href={logHref} className={secondaryButton}>
        + Log a session
      </Link>
    ),
    schedule: (
      <button key="schedule" type="button" className={secondaryButton} onClick={() => openCreate()}>
        Schedule a lesson
      </button>
    ),
    student: (
      <Link key="student" href={addStudentHref} className={secondaryButton}>
        Add a student
      </Link>
    ),
    link: (
      <button key="link" type="button" className={secondaryButton} onClick={focusLinks}>
        Add a class link
      </button>
    ),
    invoice: null,
  };

  let primary: React.ReactNode;
  let primaryKey: Key | null = null;
  let extra: React.ReactNode = null;
  switch (next.kind) {
    case "add_student":
      primaryKey = "student";
      primary = (
        <Link href={addStudentHref} className={primaryButton}>
          + Add your first student
        </Link>
      );
      break;
    case "open_class":
      primary = (
        <a href={next.url} target="_blank" rel="noreferrer" className={primaryButton}>
          Open class with {next.studentName.split(" ")[0]}
        </a>
      );
      extra = (
        <button key="copy" type="button" className={secondaryButton} onClick={() => copy(next.url)}>
          {copyState === "copied" ? "Link copied" : copyState === "failed" ? "Couldn't copy" : "Copy class link"}
        </button>
      );
      break;
    case "log_session":
      primaryKey = "log";
      primary = (
        <Link href={logHref} className={primaryButton}>
          + Log {next.count === 1 ? "your last lesson" : `${next.count} past lessons`}
        </Link>
      );
      break;
    case "schedule_lesson":
      primaryKey = "schedule";
      primary = (
        <button type="button" className={primaryButton} onClick={() => openCreate()}>
          Schedule a lesson
        </button>
      );
      break;
    case "create_invoice":
      primaryKey = "invoice";
      primary = (
        <Link href={invoicesHref} className={primaryButton}>
          Create an invoice
        </Link>
      );
      break;
    default:
      primaryKey = "log";
      primary = (
        <Link href={logHref} className={primaryButton}>
          + Log a session
        </Link>
      );
  }

  const order: Key[] = ["log", "schedule", "student", "link"];
  return (
    <div className="flex flex-wrap gap-2" data-testid="dashboard-actions" data-next={next.kind}>
      <span className="contents [&>*]:w-full sm:[&>*]:w-auto">{primary}</span>
      {extra}
      {order.filter((k) => k !== primaryKey).map((k) => secondary[k])}
    </div>
  );
}
