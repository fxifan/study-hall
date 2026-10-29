export type SubjectStage = "junior" | "vce";
export type Subject = { id: string; name: string; stage: SubjectStage; sort: number };

/** Which subject lists fit a year level: Years 7–9 junior, Year 10 both (VCE units start), 11–12 VCE. */
export function stagesForYear(year: number): SubjectStage[] {
  if (year <= 9) return ["junior"];
  if (year === 10) return ["junior", "vce"];
  return ["vce"];
}
