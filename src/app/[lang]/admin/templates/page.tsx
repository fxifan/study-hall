import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShellFallback } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { addTemplate, saveTemplate } from "../actions";
import { AdminFrame, fieldClass } from "../admin-frame";

export const metadata: Metadata = { title: "Report templates" };

export default async function TemplatesPage() {
  const t = await getDictionary();
  return (
    <Suspense fallback={<AppShellFallback label={t.common.loading} />}>
      <Templates />
    </Suspense>
  );
}

type Template = { id: string; kind: "observation" | "comment"; text_en: string; text_zh: string; active: boolean };

/** Bilingual wording supervisors pick when writing reports (see the migration report_templates_and_zoom). */
async function Templates() {
  const a = (await getDictionary()).adminPages.templates;
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("report_templates")
    .select("id, kind, text_en, text_zh, active")
    .order("sort")
    .order("created_at")
    .returns<Template[]>();

  const row = (template: Template) => (
    <form
      key={template.id}
      action={saveTemplate}
      className={`grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end ${template.active ? "" : "opacity-60"}`}
      aria-label={template.text_en}
    >
      <input type="hidden" name="id" value={template.id} />
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        {a.english}
        <Input name="textEn" required maxLength={200} defaultValue={template.text_en} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-soft" lang="zh-CN">
        {a.chinese}
        <Input name="textZh" required maxLength={200} defaultValue={template.text_zh} />
      </label>
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="active" defaultChecked={template.active} />
          {a.active}
        </label>
        <Button type="submit" variant="outline" size="sm">
          {a.save}
        </Button>
      </div>
    </form>
  );

  return (
    <AdminFrame title={a.title} current="templates">
      <p className="text-sm text-ink-soft">{a.intro}</p>
      {(["observation", "comment"] as const).map((kind) => {
        const list = (templates ?? []).filter((x) => x.kind === kind);
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h2 className="text-xl font-medium">{a[kind]}</h2>
            {list.length ? (
              <div className="divide-y divide-rule rounded-md border border-hair bg-sheet" data-testid={`templates-${kind}`}>
                {list.map(row)}
              </div>
            ) : (
              <p className="text-ink-soft">{a.empty}</p>
            )}
          </section>
        );
      })}
      <form action={addTemplate} className="grid gap-2 rounded-md border border-dashed border-rule p-4 text-sm sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end" aria-label={a.add}>
        <label className="flex flex-col gap-1">
          {a.kind}
          <select name="kind" className={fieldClass} defaultValue="observation">
            <option value="observation">{a.observation}</option>
            <option value="comment">{a.comment}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {a.english}
          <Input name="textEn" required maxLength={200} />
        </label>
        <label className="flex flex-col gap-1" lang="zh-CN">
          {a.chinese}
          <Input name="textZh" required maxLength={200} />
        </label>
        <Button type="submit">{a.add}</Button>
      </form>
    </AdminFrame>
  );
}
