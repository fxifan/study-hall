import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminFrame, fieldClass } from "../admin-frame";
import { savePoint, setGroupPublished } from "./actions";

export const metadata: Metadata = { title: "Curriculum" };

type Point = {
  id: string;
  framework: "vce" | "vc";
  subject: string;
  unit_or_level: string;
  area: string;
  code: string | null;
  summary: string;
  accreditation: string | null;
  source_url: string | null;
  checked_on: string | null;
  is_published: boolean;
};

/**
 * /admin/curriculum: check the imported curriculum points against the VCAA documents, edit them,
 * and publish them. Tutors only see published points when making practice sets.
 */
export default function CurriculumPage(props: PageProps<"/[lang]/admin/curriculum">) {
  return (
    <Suspense fallback={<AppShellFallback label="Loading…" />}>
      <Curriculum searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Curriculum({ searchParams }: Pick<PageProps<"/[lang]/admin/curriculum">, "searchParams">) {
  await requireRole("admin"); // before the service-role read
  const query = await searchParams;
  const { data } = await createAdminClient()
    .from("curriculum_points")
    .select("id, framework, subject, unit_or_level, area, code, summary, accreditation, source_url, checked_on, is_published")
    .order("sort")
    .returns<Point[]>();
  const points = data ?? [];
  const groups = new Map<string, Point[]>();
  for (const p of points) {
    const key = `${p.framework}|${p.subject}|${p.unit_or_level}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const open = typeof query.group === "string" ? query.group : null;
  const published = points.filter((p) => p.is_published).length;

  return (
    <AdminFrame title="Curriculum" current="curriculum">
      <p className="text-sm text-ink-soft">
        Points tutors build practice sets from. Each is Edumi&apos;s own short paraphrase, imported unpublished. Check each group against
        the VCAA document (link per group), fix anything, then publish. {published} of {points.length} published.
      </p>
      <ul className="flex flex-col gap-2" data-testid="curriculum-groups">
        {[...groups.entries()].map(([key, rows]) => {
          const [framework, subject, unit] = key.split("|");
          const live = rows.filter((r) => r.is_published).length;
          const expanded = open === key;
          return (
            <li key={key} className="dash-card px-4 py-3 text-sm" data-testid="curriculum-group">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a href={`?group=${encodeURIComponent(key)}`} className="font-medium underline-offset-4 hover:underline">
                  {framework === "vce" ? "VCE" : "Years 7–10"} · {subject} · {unit}
                </a>
                <span className="text-xs text-ink-soft">
                  {live}/{rows.length} published · {rows[0].accreditation}
                  {rows[0].source_url && (
                    <>
                      {" · "}
                      <a href={rows[0].source_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        VCAA source
                      </a>
                    </>
                  )}
                </span>
                <form action={setGroupPublished} className="flex gap-1">
                  <input type="hidden" name="framework" value={framework} />
                  <input type="hidden" name="subject" value={subject} />
                  <input type="hidden" name="unitOrLevel" value={unit} />
                  <Button type="submit" name="publish" value="publish" size="xs" variant="outline">
                    Publish all
                  </Button>
                  <Button type="submit" name="publish" value="unpublish" size="xs" variant="ghost">
                    Unpublish all
                  </Button>
                </form>
              </div>
              {expanded && (
                <ul className="mt-3 flex flex-col gap-3">
                  {rows.map((p) => (
                    <li key={p.id}>
                      <form action={savePoint} className="grid gap-2 sm:grid-cols-[14rem_1fr_7rem_auto]" aria-label={p.summary}>
                        <input type="hidden" name="id" value={p.id} />
                        <input name="area" defaultValue={p.area} aria-label="Area" className={fieldClass} />
                        <textarea name="summary" defaultValue={p.summary} aria-label="Summary" rows={2} className={`${fieldClass} h-auto py-1.5`} />
                        <input name="code" defaultValue={p.code ?? ""} placeholder="Code" aria-label="Code" className={fieldClass} />
                        <div className="flex flex-wrap items-start gap-1">
                          <Button type="submit" name="publish" value="save" size="xs" variant="ghost">
                            Save
                          </Button>
                          {p.is_published ? (
                            <Button type="submit" name="publish" value="unpublish" size="xs" variant="ghost">
                              Unpublish
                            </Button>
                          ) : (
                            <Button type="submit" name="publish" value="publish" size="xs" variant="outline">
                              Publish
                            </Button>
                          )}
                        </div>
                      </form>
                      <p className="mt-1 text-xs text-ink-faint">{p.is_published ? `Published${p.checked_on ? `, checked ${p.checked_on}` : ""}` : "Not published"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </AdminFrame>
  );
}
