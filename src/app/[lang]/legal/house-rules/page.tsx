import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "House rules" };

export default function HouseRulesPage() {
  return <LegalPage document="house_rules" />;
}
