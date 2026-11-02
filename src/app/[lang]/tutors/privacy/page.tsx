import type { Metadata } from "next";
import { TUTOR_PRIVACY } from "@/lib/tutor/legal";
import { TutorLegalPage } from "../legal-frame";

export const metadata: Metadata = { title: "Privacy Policy for tutors" };

export default function TutorPrivacyPage() {
  return <TutorLegalPage title="Privacy Policy" body={TUTOR_PRIVACY} />;
}
