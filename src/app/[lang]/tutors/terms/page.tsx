import type { Metadata } from "next";
import { TUTOR_TERMS } from "@/lib/tutor/legal";
import { TutorLegalPage } from "../legal-frame";

export const metadata: Metadata = { title: "Terms of Service for tutors" };

export default function TutorTermsPage() {
  return <TutorLegalPage title="Terms of Service" body={TUTOR_TERMS} />;
}
