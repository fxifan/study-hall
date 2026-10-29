import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { saveRoom } from "../actions";
import { AdminFrame, fieldClass } from "../admin-frame";

export const metadata: Metadata = { title: "Rooms" };

export default async function RoomsPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Rooms />
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
};

async function Rooms() {
  const r = (await getDictionary()).adminPages.rooms;
  const supabase = await createClient();
  const [{ data: rooms }, { data: proctors }] = await Promise.all([
    supabase.from("rooms").select("id, name, video_url, capacity, default_proctor_id, default_tutor_id").order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("role", "proctor").order("full_name"),
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

  return (
    <AdminFrame title={r.title} current="rooms">
      <p className="text-sm text-ink-soft">{r.capacityHelp}</p>
      {rooms?.map((room) => form(room))}
      {form(null)}
    </AdminFrame>
  );
}
