import type { Metadata } from "next";
import { LegalFrame } from "@/components/legal-page";
import { STUDENT_TERMS, STUDENT_TERMS_DATE, STUDENT_TERMS_DRAFT, STUDENT_TERMS_VERSION } from "@/lib/student-terms";

export const metadata: Metadata = { title: "Terms of use" };

/** Terms of use for Edumi study groups (src/lib/student-terms.ts). */
export default function StudentTermsPage() {
  return (
    <LegalFrame
      doc={{ title: "Terms of use", version: STUDENT_TERMS_VERSION, published_at: STUDENT_TERMS_DATE, is_draft: STUDENT_TERMS_DRAFT, body: STUDENT_TERMS }}
    />
  );
}
