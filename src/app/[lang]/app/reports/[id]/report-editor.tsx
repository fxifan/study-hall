"use client";

import { useState, useTransition } from "react";
import { useCopyText } from "@/components/report-cards";
import { LABELS, reportText, type ReportMeta } from "@/lib/report/render";
import { WORD_LIMIT, wordCount, type ReportBody, type ReportContent, type ReportLang } from "@/lib/report/schema";
import { markShared, saveReport, sendReport, translateAgain } from "../actions";
import { field, primaryButton, secondaryButton } from "../../_components/styles";

const LIST_KEYS = ["covered", "wentWell", "nextFocus", "homework"] as const;
const MAX_ITEMS: Record<(typeof LIST_KEYS)[number], number> = { covered: 8, wentWell: 2, nextFocus: 2, homework: 4 };
const EMPTY: ReportContent = { covered: [], wentWell: [], nextFocus: [], homework: [], tutorNote: "" };

/** Drop blank items (from "+ Add" left empty) before saving or sending. */
function tidy(body: ReportBody): ReportBody {
  const clean = (c: ReportContent): ReportContent => ({
    covered: c.covered.map((s) => s.trim()).filter(Boolean),
    wentWell: c.wentWell.map((s) => s.trim()).filter(Boolean),
    nextFocus: c.nextFocus.map((s) => s.trim()).filter(Boolean),
    homework: c.homework.map((s) => s.trim()).filter(Boolean),
    tutorNote: c.tutorNote.trim(),
  });
  return Object.fromEntries(Object.entries(body).map(([l, c]) => [l, c ? clean(c) : c]));
}

/**
 * Review → edit → send (spec §3.3, §4). Every field is editable; English and Chinese side by side on
 * wide screens, one above the other on a phone. Nothing goes to the parent until Send.
 */
export function ReportEditor({
  reportId,
  initial,
  langs,
  meta,
  parentEmail,
  sent,
}: {
  reportId: string;
  initial: ReportBody;
  langs: ReportLang[];
  meta: ReportMeta;
  parentEmail: string;
  sent: { at: string; to: string } | null;
}) {
  // The English version is always kept: Chinese is translated from it.
  const shown: ReportLang[] = sent ? langs : (["en", ...langs.filter((l) => l !== "en")] as ReportLang[]);
  const [body, setBody] = useState<ReportBody>(() => Object.fromEntries(shown.map((l) => [l, initial[l] ?? EMPTY])));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [copyState, copy] = useCopyText();
  const [dirty, setDirty] = useState(false);

  const update = (lang: ReportLang, next: ReportContent) => {
    setBody((b) => ({ ...b, [lang]: next }));
    setDirty(true);
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      setMessage(null);
      const result = await fn();
      if (result.ok) setDirty(false);
      setMessage(result.ok ? { tone: "ok", text: result.message ?? "Done." } : { tone: "error", text: result.error ?? "Something went wrong." });
    });

  const sendBody: ReportBody = Object.fromEntries(langs.map((l) => [l, body[l]]));
  const text = reportText(tidy(sendBody), meta, langs);

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-md border border-hair bg-sheet px-3 py-2 text-sm">
          {sent.to === "copied as text" ? "Shared as text" : `Sent to ${sent.to}`} · {sent.at}
        </p>
        <pre className="rounded-lg border border-hair bg-sheet p-4 font-sans text-sm whitespace-pre-wrap">{text}</pre>
        <button type="button" className={secondaryButton} onClick={() => copy(text)}>
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy as text"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid gap-4 ${shown.length > 1 ? "md:grid-cols-2" : ""}`}>
        {shown.map((lang) => (
          <LanguageColumn
            key={lang}
            lang={lang}
            content={body[lang] ?? EMPTY}
            onChange={(c) => update(lang, c)}
            notSent={!langs.includes(lang)}
            meta={meta}
            translate={
              lang === "zh-CN"
                ? () =>
                    run(async () => {
                      const result = await translateAgain(reportId, tidy(body).en);
                      if (result.ok && result.zh) {
                        setBody((b) => ({ ...b, "zh-CN": result.zh as ReportContent }));
                        setDirty(true);
                      }
                      return result;
                    })
                : undefined
            }
            pending={pending}
          />
        ))}
      </div>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${message.tone === "error" ? "border-pen text-pen" : "border-hair bg-sheet"}`}>
          {message.text}
        </p>
      )}

      <div className="sticky bottom-16 flex flex-col gap-2 rounded-lg border border-hair bg-paper/95 p-3 backdrop-blur sm:bottom-2">
        <button
          type="button"
          className={primaryButton}
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Send this report to ${parentEmail}?`)) run(() => sendReport(reportId, tidy(body)));
          }}
        >
          {pending ? "Working…" : `Send to ${parentEmail}`}
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className={secondaryButton} disabled={pending || !dirty} onClick={() => run(() => saveReport(reportId, tidy(body)))}>
            {dirty ? "Save" : "Saved"}
          </button>
          <button type="button" className={secondaryButton} onClick={() => copy(text)}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy text"}
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={pending}
            title="Record that you shared it on WeChat or WhatsApp"
            onClick={() => {
              if (window.confirm("Mark as shared (e.g. pasted into WeChat)? It won't be emailed.")) run(() => markShared(reportId, tidy(body)));
            }}
          >
            Shared
          </button>
        </div>
      </div>
    </div>
  );
}

function LanguageColumn({
  lang,
  content,
  onChange,
  notSent,
  meta,
  translate,
  pending,
}: {
  lang: ReportLang;
  content: ReportContent;
  onChange: (c: ReportContent) => void;
  notSent: boolean;
  meta: ReportMeta;
  translate?: () => void;
  pending: boolean;
}) {
  const t = LABELS[lang];
  const words = wordCount(content, lang);
  const setList = (key: (typeof LIST_KEYS)[number], items: string[]) => onChange({ ...content, [key]: items });
  return (
    <section lang={lang} className="flex flex-col gap-3 rounded-lg border border-hair bg-sheet p-4" aria-label={t.name}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-xs tracking-widest text-ink-soft uppercase">
          {t.name}
          {notSent && <span className="ml-2 normal-case tracking-normal">(for reference, not sent)</span>}
        </h2>
        <span className={`text-xs ${words > WORD_LIMIT ? "text-pen" : "text-ink-faint"}`}>
          {words} / {WORD_LIMIT} words{words > WORD_LIMIT ? " · try to shorten" : ""}
        </span>
      </header>
      <p className="text-sm">
        <span className="text-ink-soft">{t.session}</span>
        {t.colon}
        {[meta.date[lang], meta.time[lang], meta.subjects.join(", ")].filter(Boolean).join(" · ")}
      </p>
      {LIST_KEYS.map((key) => (
        <fieldset key={key} className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">{t[key]}</legend>
          {content[key].map((item, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <textarea
                className={`${field} h-auto min-h-11 py-2`}
                rows={Math.max(1, Math.ceil(item.length / 40))}
                value={item}
                maxLength={300}
                aria-label={`${t[key]} ${i + 1}`}
                onChange={(e) => setList(key, content[key].map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button
                type="button"
                aria-label={`Remove ${t[key]} ${i + 1}`}
                className="h-11 w-9 shrink-0 rounded-lg text-ink-faint hover:text-pen sm:h-9"
                onClick={() => setList(key, content[key].filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          {content[key].length < MAX_ITEMS[key] && (
            <button type="button" className="self-start text-sm text-ink-soft underline-offset-4 hover:underline" onClick={() => setList(key, [...content[key], ""])}>
              + Add
            </button>
          )}
        </fieldset>
      ))}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t.tutorNote}
        <textarea
          className={`${field} h-20 py-2`}
          value={content.tutorNote}
          maxLength={400}
          onChange={(e) => onChange({ ...content, tutorNote: e.target.value })}
        />
      </label>
      {translate && (
        <button type="button" className={secondaryButton} disabled={pending} onClick={translate}>
          Translate again from English
        </button>
      )}
    </section>
  );
}
