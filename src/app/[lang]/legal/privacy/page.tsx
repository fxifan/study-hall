import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy & child safety notice" };

export default function PrivacyPage() {
  return <LegalPage document="privacy_child_safety" />;
}
