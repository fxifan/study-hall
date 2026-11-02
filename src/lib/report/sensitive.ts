/**
 * Sensitive-disclosure screen (docs/tutor-reports-spec.md §6). A deterministic backstop to the
 * model's own `sensitive` flag: if a note mentions wellbeing, safety, self-harm or abuse, that
 * content must never reach the parent report, and the tutor sees a private notice instead.
 * Never escalates anything automatically.
 *
 * Deliberately broad: a false positive costs the tutor one glance at a notice; a false negative
 * could put a child's disclosure in an email. English and Simplified Chinese.
 */
const PATTERNS: RegExp[] = [
  /\bself[- ]?harm/i,
  /\bsuicid/i,
  /\bkill(?:ing)? (?:him|her|them)sel(?:f|ves)\b/i,
  /\bwant(?:s|ed)? to die\b/i,
  /\bcut(?:s|ting)? (?:him|her|them)sel(?:f|ves)\b/i,
  /\bhurt(?:s|ing)? (?:him|her|them)sel(?:f|ves)\b/i,
  /\babus(?:e|ed|ive|ing)\b/i,
  /\bhits? (?:him|her|them)\b/i,
  /\b(?:getting|got|being) (?:hit|beaten|hurt)\b/i,
  /\bunsafe\b|\bnot safe\b/i,
  /\bscared (?:to go home|of (?:his|her|their) (?:dad|mum|mom|father|mother|parent))/i,
  /\bbull(?:y|ied|ying)\b/i,
  /\bdepress(?:ed|ion)\b/i,
  /\banxiety\b|\bpanic attack/i,
  /\bmental health\b|\bwellbeing\b|\bwell-being\b/i,
  /\beating disorder\b|\banorexi|\bbulimi/i,
  // Subject words like "alcohol" (chemistry), "police" (legal studies) or "sexual reproduction"
  // (biology) are deliberately not listed.
  /\bchild protection\b|\bcalled the police\b/i,
  /\bvap(?:e|es|ing)\b|\bdrunk\b|\btaking drugs\b/i,
  /\bdivorce\b|\bdomestic violence\b|\bfamily violence\b/i,
  /\bgrooming\b|\bsexual (?:abuse|assault)|\binappropriate(?:ly)? touch/i,
  /\bcrying\b|\bcried\b/i,
  // Simplified Chinese
  /自残|自杀|轻生|想死|不想活|割腕|伤害自己/,
  /虐待|家暴|打(?:他|她)|被打|不安全|害怕回家/,
  /霸凌|欺负|抑郁|焦虑|心理健康|情绪问题|进食障碍/,
  /报警|警察|性侵|猥亵|吸毒|离婚/,
  /哭了|在哭/,
];

export function isSensitive(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}
