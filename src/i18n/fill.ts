/** Fill {placeholders} in a dictionary string: fill("Year {year}", { year: 11 }) -> "Year 11". */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
