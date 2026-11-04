"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { field, labelClass, primaryButton, secondaryButton } from "../_components/styles";

export type LogStudent = { id: string; name: string; subjects: string[]; lang: string };

const MAX_SECONDS = 180;
const DURATIONS = [30, 45, 60, 75, 90, 120];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Log a session (spec §3.3): student, time, then a voice note (MediaRecorder, max 3 minutes) and/or
 * typed notes. The recording stays in this page's memory until it's uploaded; if transcription
 * fails it's still here to retry. Mobile first: big targets, one column.
 */
export function LogForm({
  students,
  defaults,
  initialStudentId,
  reportPath,
  blocked,
}: {
  students: LogStudent[];
  defaults: { date: string; startTime: string; durationMin: number };
  initialStudentId: string | null;
  reportPath: string;
  blocked: string | null;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(initialStudentId ?? (students.length === 1 ? students[0].id : ""));
  const student = students.find((s) => s.id === studentId);
  const [subjects, setSubjects] = useState<string[]>(student?.subjects.slice(0, 1) ?? []);
  const [otherSubject, setOtherSubject] = useState("");
  const [date, setDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [duration, setDuration] = useState(defaults.durationMin);
  const [notes, setNotes] = useState("");

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<{ blob: Blob; seconds: number } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stage, setStage] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => stopTracks(), []);

  function chooseStudent(id: string) {
    setStudentId(id);
    const s = students.find((x) => x.id === id);
    setSubjects(s?.subjects.slice(0, 1) ?? []);
  }

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }

  async function startRecording() {
    setMicError(null);
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicError("This browser can't record audio. Type your notes instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError("Microphone access was blocked. Allow it in your browser settings, or type your notes.");
      return;
    }
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const length = Math.min(MAX_SECONDS, (Date.now() - startedAt.current) / 1000);
      setAudio({ blob: new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }), seconds: length });
      setRecording(false);
      stopTracks();
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setSeconds(0);
    setAudio(null);
    rec.start(1000);
    setRecording(true);
    timer.current = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS) rec.stop();
    }, 250);
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return setError("Pick a student.");
    if (!audio && !notes.trim()) return setError("Record a voice note or type a few notes.");
    setError(null);
    setStage("working");
    const body = new FormData();
    body.set("studentId", studentId);
    body.set("date", date);
    body.set("startTime", startTime);
    body.set("durationMin", String(duration));
    body.set("subjects", [...subjects, ...otherSubject.split(",")].map((s) => s.trim()).filter(Boolean).join(","));
    body.set("notes", notes);
    if (audio) {
      body.set("audio", audio.blob, "note");
      body.set("audioSeconds", String(Math.round(audio.seconds)));
    }
    try {
      const res = await fetch("/api/tutor/draft", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { reportId?: string; error?: string };
      if (!res.ok || !json.reportId) {
        setStage("idle");
        setError(json.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push(`${reportPath}/${json.reportId}`);
    } catch {
      setStage("idle");
      setError("No connection. Your recording is still here: try again.");
    }
  }

  if (!students.length) return null;
  const toggle = (s: string) => setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className={labelClass}>
        Student
        <select className={field} value={studentId} onChange={(e) => chooseStudent(e.target.value)} required>
          <option value="">Choose…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className={`${labelClass} col-span-2 sm:col-span-1`}>
          Date
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className={labelClass}>
          Start
          <input type="time" step={300} className={field} value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </label>
        <label className={labelClass}>
          Length
          <select className={field} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Subjects</legend>
        <div className="flex flex-wrap gap-2">
          {(student?.subjects ?? []).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={subjects.includes(s)}
              onClick={() => toggle(s)}
              className={`h-9 rounded-full border px-3 text-sm ${subjects.includes(s) ? "border-ink bg-ink text-paper" : "border-hair bg-sheet"}`}
            >
              {s}
            </button>
          ))}
          <input
            className={`${field} h-9 w-40 sm:h-9`}
            placeholder="Other subject"
            value={otherSubject}
            onChange={(e) => setOtherSubject(e.target.value)}
            aria-label="Other subject"
          />
        </div>
      </fieldset>

      <section aria-label="Voice note" className="flex flex-col items-center gap-3 rounded-lg border border-hair bg-sheet p-5 text-center">
        {recording ? (
          <>
            <p className="font-mono text-3xl tabular-nums" aria-live="polite">
              {mmss(seconds)} <span className="text-base text-ink-faint">/ 3:00</span>
            </p>
            <button type="button" onClick={stopRecording} className="flex size-20 items-center justify-center rounded-full bg-pen text-paper" aria-label="Stop recording">
              <span className="size-6 rounded-sm bg-paper" />
            </button>
            <p className="text-sm text-ink-soft">Say what you covered, what went well, what&apos;s next, and any homework.</p>
          </>
        ) : audio ? (
          <>
            <p className="text-sm">
              Voice note recorded · <span className="font-mono">{mmss(audio.seconds)}</span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={startRecording} className={secondaryButton}>
                Record again
              </button>
              <button type="button" onClick={() => setAudio(null)} className={secondaryButton}>
                Discard
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startRecording}
              disabled={stage === "working"}
              className="flex size-20 items-center justify-center rounded-full bg-pen text-paper shadow-sm"
              aria-label="Record a voice note"
            >
              <svg viewBox="0 0 24 24" className="size-8" fill="currentColor" aria-hidden="true">
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
              </svg>
            </button>
            <p className="text-sm text-ink-soft">Tap to record a voice note (up to 3 minutes)</p>
          </>
        )}
        {micError && <p className="text-sm text-pen">{micError}</p>}
      </section>

      <label className={labelClass}>
        Or type notes {audio && <span className="font-normal text-ink-soft">(added to the voice note)</span>}
        <textarea
          className={`${field} h-28 py-2`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={5000}
          placeholder="e.g. Did chain rule, Q1–8 of 6B. Good on basic examples, needs practice with nested functions. HW: 6B Q9–15."
        />
      </label>

      {error && (
        <p role="alert" className="rounded-md border border-pen px-3 py-2 text-sm text-pen">
          {error}
        </p>
      )}
      {blocked ? (
        <p role="alert" className="rounded-md border border-pen px-3 py-2 text-sm text-pen">
          {blocked}
        </p>
      ) : (
        <button type="submit" className={primaryButton} disabled={stage === "working" || recording}>
          {stage === "working" ? (audio ? "Transcribing and drafting…" : "Drafting…") : "Draft report"}
        </button>
      )}
      <p className="text-xs text-ink-faint">
        Nothing is sent to the parent until you review the report and tap Send. Voice notes are deleted as soon as they&apos;re transcribed.
      </p>
    </form>
  );
}
