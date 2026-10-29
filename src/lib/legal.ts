import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export type LegalDocumentKind = "house_rules" | "privacy_child_safety";

export type LegalDocument = {
  document: LegalDocumentKind;
  version: string;
  title: string;
  body: string;
  is_draft: boolean;
  published_at: string;
};

/**
 * The current (latest published) version of a legal document. Read as a signed-out visitor, so
 * it can render on static pages; cached and tagged "legal" (revalidate when a version is published).
 * Single-org MVP: it doesn't filter by org.
 */
export async function getCurrentLegalDocument(document: LegalDocumentKind): Promise<LegalDocument | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("legal");

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("legal_documents")
    .select("document, version, title, body, is_draft, published_at")
    .eq("document", document)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Loading ${document}: ${error.message}`);
  return data;
}
