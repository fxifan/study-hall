import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { zoomConfigured } from "@/lib/zoom";
import { createRoomZoomMeeting, saveRoom } from "../actions";
import { AdminFrame, fieldClass } from "../admin-frame";

export const metadata: Metadata = { title: "Rooms" };

export default async function RoomsPage({ searchParams }: PageProps<"/[lang]/admin/rooms">) {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Rooms searchParams={searchParams} />
    </Suspense>
  );
}

type Room = {
  id: string;
  name: string;
  video_url: string;
  capacity: number;
  default_proctor_id: string | null;
  default_tutor_id: string | null;
  zoom_meeting_id: string | null;
};

async function Rooms({ searchParams }: Pick<PageProps<"/[lang]/admin/rooms">, "searchParams">) {
  const [r, query] = await Promise.all([getDictionary().then((t) => t.adminPages.rooms), searchParams]);
  const zoomReady = zoomConfigured();
  const supabase = await createClient();
  const [{ data: rooms }, { data: proctors }] = await Promise.all([
    supabase.from("rooms").select("id, name, video_url, capacity, default_proctor_id, default_tutor_id, zoom_meeting_id").order("name"),
    supabase.from("profiles").select("id, full_name, email").in("role", ["proctor", "admin"]).order("full_name"),
  ]);

  const form = (room: Room | null) => (
    <form key={room?.id ?? "new"} action={saveRoom} className="grid gap-2 rounded-md border border-hair bg-sheet p-4 sm:grid-cols-2" aria-label={room?.name ?? r.add}>
      {room && <input type="hidden" name="id" value={room.id} />}
      <label className="flex flex-col gap-1 text-sm">
        {r.name}
        <Input name="name" required defaultValue={room?.name} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {r.capacity}
        <Input name="capacity" type="number" min={1} max={500} required defaultValue={room?.capacity ?? 40} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        {r.videoUrl}
        <Input name="videoUrl" type="url" required pattern="https://.*" defaultValue={room?.video_url} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {r.defaultProctor}
        <select name="defaultProctorId" defaultValue={room?.default_proctor_id ?? ""} className={fieldClass}>
          <option value="">{r.none}</option>
          {proctors?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? p.email}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {r.defaultTutor}
        <select name="defaultTutorId" defaultValue={room?.default_tutor_id ?? ""} className={fieldClass}>
          <option value="">{r.none}</option>
          {proctors?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? p.email}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end sm:col-span-2">
        <Button type="submit">{room ? r.save : r.add}</Button>
      </div>
    </form>
  );

  // Zoom sits beside each room's form (forms can't nest).
  const zoom = (room: Room) => (
    <form key={`zoom-${room.id}`} action={createRoomZoomMeeting} className="-mt-2 flex flex-wrap items-center gap-3 px-4 text-sm" aria-label={`Zoom: ${room.name}`}>
      <input type="hidden" name="roomId" value={room.id} />
      {room.zoom_meeting_id && <span className="font-mono text-xs text-ink-soft">{fill(r.zoomLinked, { id: room.zoom_meeting_id })}</span>}
      <Button type="submit" variant="outline" size="sm" disabled={!zoomReady}>
        {room.zoom_meeting_id ? r.zoomReplace : r.zoomCreate}
      </Button>
    </form>
  );
  const notice =
    query.zoom === "created"
      ? { role: "status" as const, text: r.zoomCreated }
      : query.zoom === "error"
        ? { role: "alert" as const, text: fill(r.zoomError, { message: typeof query.message === "string" ? query.message : "" }) }
        : null;

  return (
    <AdminFrame title={r.title} current="rooms">
      {notice && (
        <p role={notice.role} className="rounded-md border border-hair bg-sheet px-3 py-2 text-sm">
          {notice.text}
        </p>
      )}
      <p className="text-sm text-ink-soft">{r.capacityHelp}</p>
      <p className={`text-sm ${zoomReady ? "text-ink-soft" : "rounded-md border border-pen-faint px-3 py-2 text-pen"}`} data-testid="zoom-status">
        {zoomReady ? r.zoomSettings : r.zoomOff}
      </p>
      {rooms?.flatMap((room) => [form(room), zoom(room)])}
      {form(null)}
    </AdminFrame>
  );
}
