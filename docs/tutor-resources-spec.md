# Tutor resources: AI practice sets (spec, draft)

Branch `feature/tutor-resources`. Owner brief, 5 Nov 2026: give tutors AI-generated resources that
follow the Victorian curriculum, to complement their own materials. **Version 1 is practice sets**,
for **VCE (Units 1–4) and Years 7–10**. Everything else from the brainstorm is listed under "Later".

## 1. What a tutor can do

1. In the tutor app (`/app/resources`), choose:
   - **level:** a VCE subject and unit, or a Year 7–10 learning area and year;
   - **curriculum points:** one or more VCE key knowledge or skills points, or Victorian Curriculum
     content descriptions;
   - **question count:** 5–15 questions;
   - **difficulty:** foundation, standard or extension;
   - **question types:** short answer, multiple choice, extended response, or worked calculation.
     Defaults follow the subject.
2. Optionally pick one of their students. That fills in the year level and subject, and offers the
   topics from the student's recent reports as suggestions. Only topic names go to the model (§5).
3. Generate. The set appears as an **AI draft**: questions, then worked solutions and, for
   extended-response questions, a short marking guide.
4. Edit any question or solution, regenerate one question, delete or reorder questions.
5. **Approve** the set. Only an approved set can be exported or shared.
6. Export to two PDFs: a student copy (questions only, with working space) and a tutor copy (with
   solutions). Or attach the student copy to the next session report email.
7. Approved sets stay in the tutor's **library**, tagged by subject, unit or year, and curriculum
   point, so they can reuse a set with another student.

## 2. Curriculum data

- **Sources:**
  - VCE: the VCAA study design for each subject (outcomes, key knowledge, key skills, per unit and
    area of study).
  - Years 7–10: the Victorian Curriculum F–10 Version 2.0, also from VCAA (content descriptions per
    learning area and level). VCAA sets both; the Department of Education does not.
- **What we store:** a `curriculum_points` table with:
  - framework (`vce` or `vc`), subject or learning area, unit or level, area of study or strand;
  - the official code where there is one;
  - a short paraphrase of the point, written for the app;
  - the study design's accreditation period, e.g. "2023–2027";
  - source URL and date checked.

  The official documents are linked, not copied.
- **Copyright (to check before launch):** both curricula are © VCAA and published under VCAA's
  terms of use. Before building the import, confirm what those terms allow for a paid product. If
  in doubt, store only codes plus our own paraphrases, and link to VCAA.
- **Never used as source material:**
  - commercial study guides, textbooks and workbooks;
  - past VCAA exams and assessment reports;
  - anything a tutor uploads.

  Questions are original. They follow VCAA's command terms ("explain", "analyse", "evaluate",
  "justify", "calculate") without copying exam questions.
- **Version 1 subjects (owner decision, 5 Nov 2026):**
  - VCE practice sets: Mathematical Methods, Specialist Mathematics, General Mathematics,
    Chemistry, Physics, Biology. Psychology is left out.
  - Years 7–10 practice sets: Mathematics, Science and English. English sets cover reading
    comprehension, language and grammar, and short writing tasks, marked against a rubric rather
    than a single answer, and are built on general skills, not set texts.
  - VCE English: **general writing tips**, not practice sets. These are guides for the tutor to
    share, organised by the study design's outcomes (analytical text response, comparative, argument
    analysis, creating texts). They cover essay structure, topic-sentence and evidence habits,
    analysing language and common mistakes, and never reference a set text's content. One
    "writing tips" sheet per outcome; the tutor can tailor it (for example "for a Year 12 who loses
    marks on structure").
  - Humanities, Psychology and full VCE English practice later.
- **Loading (owner decision):** we write a one-off import per subject from the VCAA documents, as
  codes plus our own short paraphrases. The owner reviews and publishes them on `/admin/curriculum`
  before tutors can pick them (`is_published`). When VCAA accredits a new study design, the old
  points stay attached to existing sets, and the new ones become the default.

## 3. Generation and accuracy

- One call to the existing LLM wrapper (`src/lib/llm`), with structured output: a list of
  questions, each with:
  - type, marks, question text, options (for multiple choice), answer, worked solution;
  - the curriculum point codes it covers.
- The prompt includes the curriculum points, level, difficulty and question types, plus rules: no
  copyrighted text, Australian spelling, metric units, and VCE notation and formula-sheet
  conventions.
- **Second check for Maths, Chemistry and Physics:** a separate call re-solves each question from
  the question text alone, without the given answer. A question is flagged **"Check this answer"**
  when the two answers disagree. Flagged questions can't be approved until the tutor edits or
  dismisses the flag.
- Maths renders with KaTeX on screen and in the PDF (it is already common in Next.js apps;
  confirm the bundle size).
- Every set shows "AI draft: check every question before using it" until it is approved. The tutor
  is responsible for what they hand out (tutor terms to be updated).

## 4. Plans, limits and cost

- **Owner decision:** Solo includes practice sets and writing tips; the trial gets 3 in total, so
  tutors can try it.
- Each generation and each re-solve check logs a `tutor_usage_events` row of kind `llm_tokens`, so
  it counts towards the existing monthly AI cap (`MONTHLY_DRAFT_CAP`) and shows on Tutor costs.
- **Owner decision:** practice sets and writing tips have their own monthly cap of **60 per tutor**
  (Melbourne calendar month), separate from the 300 report drafts, because a set uses several times
  the tokens of a report draft. The usage rows carry a `purpose` so the two caps are counted
  separately.
- **Cost estimate:** 15 questions plus solutions plus the re-solve check is about 15–25k tokens, so
  A$0.02–0.04 per set at the current blended rate. Check against real usage in week 1.

## 5. Privacy and safety

- By default, prompts contain only the level, subject, curriculum points and settings: no student
  names, no report text, no family details.
- "Use this student's recent topics" sends only topic phrases the tutor confirms on screen (e.g.
  "chain rule", "titration"). Names and notes are never sent.
- Sets are private to the tutor who made them (RLS on `tutor_id`, like every tutor table). Admins
  see counts only, on `/admin/tutors`.
- No images or diagrams in version 1, so nothing is uploaded or generated as an image.

## 6. Data model (proposed)

- **`curriculum_points`:** org-wide, read by any signed-in tutor, written by the service role only.
  Columns: `id`, `framework`, `subject`, `unit_or_level`, `area`, `code`, `summary`,
  `accreditation`, `source_url`, `checked_on`, `is_published`, `sort`.
- **`tutor_practice_sets`:**
  - `id`, `tutor_id`, `student_id` (nullable), `title`;
  - `framework`, `subject`, `unit_or_level`, `point_ids uuid[]`;
  - `difficulty`, `question_types text[]`;
  - `status` (`draft` / `approved`);
  - `questions jsonb` (the edited version), `draft_json jsonb` (what the model returned, kept for
    quality checks);
  - `flags jsonb`, `approved_at`, `created_at`, `updated_at`.
- RLS: tutors manage their own rows. Admins get no read policy, only counts via the service role.
- Usage: the existing `tutor_usage_events`.

## 7. Pages

- `/app/resources`: the library, filtered by subject or level, plus a **New practice set** button.
- `/app/resources/new`: the choices from §1, with a curriculum point picker (search, then tick).
- `/app/resources/[id]`: edit, regenerate one question, see and resolve flags, approve, export.
- `/api/tutor/resources/[id]/pdf?copy=student|tutor`: renders the PDFs with the existing invoice
  PDF stack.
- `/admin/curriculum`: the owner checks and publishes imported points.
- `/admin/tutors`: adds a "practice sets" count per tutor.

## 8. Tests ("done when")

- **Unit:**
  - the output schema is validated;
  - a flag stops approval;
  - prompts contain no student names (snapshot of the built prompt);
  - usage is logged.
- **RLS:** one tutor can't read another's sets; tutors can't write `curriculum_points`.
- **End to end:** a tutor creates a Methods Unit 3 set offline (fixture model), edits a question,
  resolves a flag, approves it, exports both PDFs, and finds it in the library. A trial tutor is
  stopped after 3 sets.
- **Quality check:** 20 sets across the version 1 subjects, reviewed by the owner or a tutor before
  launch. Record accuracy per subject and the flag rate.

## 9. Owner decisions

Decided on 5 Nov 2026:

1. Subjects: the proposed list without Psychology, plus Years 7–10 English and VCE English writing
   tips (§2).
2. Curriculum points: we import, the owner checks and publishes (§2).
3. Access: Solo, with 3 for the trial (§4).
4. Their own cap: 60 a month (§4).

Still open:

5. Whether VCAA's terms of use allow storing the paraphrased points in a paid product. Check
   before launch.
6. Whether Study Hall's own supervisors get it too. For now it's tutor-app only, which already
   includes admins.

## Later (not version 1)

- topic summary sheets;
- exam-style questions with full marking guides;
- lesson plans;
- flashcards and vocabulary lists;
- homework suggested from the last report;
- diagrams and graphs;
- humanities, Psychology and VCE English practice sets;
- sharing sets between tutors;
- families opening sets directly in the app.
