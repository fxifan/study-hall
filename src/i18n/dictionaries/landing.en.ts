/**
 * Landing page copy (English). Shape is the source for landing.zh.ts.
 * Rules from the product brief: no promises about grades or results, no invented policies, staff
 * credentials or usage numbers. Undecided policy is left out and listed for the owner
 * (docs/comprehensive-brief-plan.md), never shown as a note on the public page.
 * **bold** marks emphasis in rich strings. {placeholders} are filled by the page.
 */
export const landingEn = {
  meta: {
    title: "Study Hall · Supervised after-school study",
    description:
      "Structured after-school study, live supervision, academic help when students get stuck, and clear progress reports for parents.",
  },
  nav: {
    skip: "Skip to content",
    sections: "Sections",
    how: "How it works",
    safety: "Safety & privacy",
    pricing: "Pricing",
    faq: "FAQ",
    logIn: "Log in",
    viewPlans: "View plans",
  },
  hero: {
    margin: "Mon–Thu",
    kicker: ["Online supervised study", "Years 7–12", "Victoria"],
    titleLead: "Make after-school study ",
    titleEm: "more consistent.",
    lede: "Live supervised study, structured goals, subject-specific academic help, and a progress report for parents after each session.",
    primary: "View plans",
    secondary: "See how it works",
  },
  live: {
    default: "Sessions Monday to Thursday, 4:00–8:00pm, Melbourne time",
    today: "Next session today at 4:00pm · doors open in {duration}",
    doors: "Doors are open · session starts at 4:00pm",
    live: "In session now · until 8:00pm",
    tomorrow: "Next session tomorrow at 4:00pm",
    later: "Next session {weekday} at 4:00pm",
    melbourne: " (Melbourne time)",
    minutes: "{m} min",
    hoursMinutes: "{h}h {m}m",
  },
  how: {
    label: "How it works",
    title: "Structure, supervision, and a report.",
    intro:
      "Study Hall gives students a structured place to work through homework, revision and practice. Students set goals, study in a supervised group, and can request academic help within the subjects we currently support. Parents receive a progress report after sessions.",
    steps: [
      {
        title: "Set goals",
        body: "Before each session, your child chooses up to three tasks they want to complete, one line each.",
      },
      {
        title: "Study with supervision",
        body: "They join a scheduled group video room with a live human supervisor, camera on their hands and desk. Study blocks and breaks run on a shared timer.",
      },
      {
        title: "Request academic help",
        body: "Stuck? They send a short help request within the subjects we currently support. The response depends on supervisor availability and your plan, and comes by text in the app or in a small group, never a private video call.",
      },
      {
        title: "Review progress",
        body: "Before leaving, your child marks each goal done, partial or not done. You get a short, factual report after the session.",
      },
    ],
  },
  session: {
    label: "A session",
    title: "Four hours, on a shared timer.",
    intro:
      "Sessions run Monday to Thursday, Melbourne time. Students study and take breaks together. They can come to as many sessions as suits your family.",
    timelineLabel: "Session timeline, 3:50pm to 8:00pm",
    study: "Study 50",
    studyShort: "50",
    segments: [
      "3:50 to 4:00pm: doors open, goals",
      "Study, 4:00 to 4:50pm",
      "Break, 4:50 to 5:00pm",
      "Study, 5:00 to 5:50pm",
      "Break, 5:50 to 6:00pm",
      "Study, 6:00 to 6:50pm",
      "Break, 6:50 to 7:00pm",
      "Study, 7:00 to 7:50pm",
      "7:50 to 8:00pm: mark goals",
    ],
    ticks: ["3:50", "4:00", "5:00", "6:00", "7:00", "8:00"],
    key: { study: "Study", break: "Break, together", goals: "Goals in, goals marked" },
    notes: [
      { time: "3:50pm", title: "Doors open", body: "Your child writes up to three goals, then joins the room." },
      { time: "4:00–7:50pm", title: "50 on, 10 off", body: "Four study blocks with breaks on the timer. Help requests go to the supervisor." },
      { time: "7:50pm", title: "Mark the goals", body: "Each goal is marked done, partial or not done before they leave." },
      { time: "After the session", title: "Your report arrives", body: "The supervisor reviews it and may add a short comment." },
    ],
  },
  report: {
    label: "What parents receive",
    title: "A short, factual report after each session.",
    intro:
      "Written from what was recorded in the session: attendance, goals and the supervisor's notes. Every report uses the same plain format.",
    variantsLabel: "Sample session",
    variants: { attended: "Attended", absent: "Didn't attend" },
    sent: "Sent {time}",
    footNote: "Plain text for WhatsApp or WeChat",
    absentNote: "Sent about 15 minutes after the session ends",
    legend: [
      {
        title: "Times from the session",
        body: "Recorded when your child joins and leaves. The supervisor confirms who was actually in the room.",
      },
      {
        title: "Goals they set themselves",
        body: "Written before joining, then marked by your child before they leave: done, partial or not done.",
      },
      {
        title: "Factual supervisor notes",
        body: "Observations such as “Phone visible twice”, plus a short comment when useful. Never ratings or labels.",
      },
    ],
    disclaimer:
      "Attendance and goal completion show participation. They aren't a measure of learning or a guarantee of results.",
    neverTitle: "Never in a report",
    never: "Webcam images, comparisons with other students, or judgements about ability or attitude.",
    deliveryTitle: "How it reaches you",
    delivery:
      "By email after every session you book. A plain-text copy is easy to forward to WhatsApp or WeChat. Reports can be read in English or Simplified Chinese; goals and supervisor notes stay as written.",
  },
  tutoring: {
    label: "Study and tutoring",
    title: "Supervised study, with tutoring if you want it.",
    body: [
      "**Supervised Study** is structured, supervised time for schoolwork your child already has: homework, revision and practice. They can request help within the subjects we support, and the supervisor responds when available. There's no dedicated tutoring hour.",
      "**Study + Tutoring** includes **one hour of tutoring for each session your child attends**, scheduled by the supervisor when you request it. The rest of the session is supervised independent study. Attend four sessions in a week and that's up to four one-hour tutoring periods; the tutor isn't with your child for the whole four hours.",
      "Neither plan replaces specialist tutoring or teaching, and we don't promise particular marks or results.",
    ],
    is: { title: "Study Hall is", items: ["Scheduled, supervised time for schoolwork", "Goals set and marked every session", "Academic help within the subjects we support", "A factual report for parents"] },
    isNot: { title: "Study Hall isn't", items: ["Unlimited one-to-one tutoring", "A guaranteed response time", "A promise of better marks or ATARs", "Webcam recording or monitoring software"] },
  },
  rules: {
    label: "House rules",
    title: "Six rules. Same for everyone.",
    intro: "Your child agrees to these when you sign up, and sees them again before every session.",
    items: [
      "Camera on, framed on your **hands and desk**. Face optional.",
      "Phone face-down **inside the camera frame** for the whole block.",
      "Mic muted unless the supervisor asks.",
      "Set up to 3 goals before you join; mark them before you leave.",
      "Breaks happen together, on the timer.",
      "The supervisor may remove you from the room if you're off camera for more than 5 minutes; your parent's report will say so.",
    ],
    foot: "Shown at sign-up and before every session.",
    fullLink: "Read the full house rules",
  },
  safety: {
    label: "Safety & privacy",
    title: "How the camera, supervisors and data are handled.",
    intro:
      "The camera is part of live supervision: a supervisor watches the room while it happens. Here is what that does and doesn't involve.",
    items: [
      {
        title: "No recording by Study Hall",
        body: "Study Hall doesn't capture, record or store video, images or audio. Sessions run on Zoom or Google Meet, which process the call under their own privacy terms.",
      },
      {
        title: "No private one-to-one video",
        body: "Help happens by text in the app, or in a breakout room with at least two students or a second adult. An adult is never alone on video with your child.",
      },
      {
        title: "Checked supervisors",
        body: "Our supervisors are current medical students with years of tutoring and teaching experience. Every supervisor must hold a Working with Children Check that we've verified, and Study Hall won't assign anyone to a session without a current, verified check.",
      },
      {
        title: "Messages are kept",
        body: "Every message between a supervisor and a student is logged and visible to Study Hall administrators. Supervisors can't delete them.",
      },
      {
        title: "Only what we need",
        body: "First name, last initial, year level, the subjects they take, an optional short note on current work, and school if you choose. No birthday, photo, address or phone number. Stored in Australia (Sydney).",
      },
      {
        title: "Parents stay in charge",
        body: "Only a parent can create a student account, after agreeing to the house rules and privacy notice. Email us to delete your child's data and we'll do it within 30 days.",
      },
    ],
    foot: "No student-to-student messaging, profiles, rankings or feeds. No ads or trackers on student pages.",
    contact: "Questions, concerns or deletion requests: {email}",
    privacyLink: "Privacy & child safety notice",
  },
  pricing: {
    label: "Pricing",
    title: "Two weekly plans. Cancel any time.",
    intro:
      "Prices are per student. Both plans cover sessions Monday to Thursday, 4:00–8:00pm Melbourne time, and your child doesn't have to come to every session.",
    checks: [
      "Billed weekly in Australian dollars through Stripe.",
      "Cancel any time from your account and keep access until the end of your paid week.",
      "Not right for you? Ask within 7 days of your first payment and we'll refund it. Refunds aren't available after that.",
    ],
    compare: {
      title: "Compare the plans",
      feature: "",
      yes: "Yes",
      rows: {
        supervision: "Live group supervision",
        goals: "Study goals and progress tracking",
        reports: "Parent progress reports",
        help: "Academic help requests",
        tutoring: "Scheduled tutoring",
        rest: "Remaining study time",
      },
      helpValue: "Within supported subjects, when a supervisor is available",
      tutoringNone: "Not included",
      tutoringHour: "One hour per session attended",
      restValue: "Supervised independent study",
    },
    cardKicker: "Study Hall · Weekly",
    per: "per student / week",
    tutoringNote:
      "Includes one hour of tutoring per session attended, scheduled by the supervisor when you request it. The rest of the session is supervised independent study.",
    rows: {
      sessions: "Sessions",
      sessionsUnlimited: "Any, Mon–Thu",
      sessionsLimited: "Up to {n} a week",
      hours: "Hours",
      hoursValue: "4:00–8:00pm",
      supervised: "Supervised by",
      supervisedValue: "WWCC-verified supervisor",
      report: "Report",
      reportValue: "After each session",
      for: "For",
      forValue: "Years 7–12",
      help: "Help",
      helpValue: "Supported subjects, when available",
      tutoring: "Tutoring",
      tutoringValue: "1 hour per session attended",
      tutoringNone: "Not included",
    },
    cta: "Start",
    ctaNote: "Refundable within 7 days of your first payment.",
    empty: "Plans will be listed here soon.",
  },
  faq: {
    label: "Questions",
    title: "Questions parents ask.",
    items: [
      {
        id: "tutoring",
        q: "Is Study Hall tutoring?",
        a: [
          "Supervised Study isn't tutoring. It's supervised time to work on schoolwork your child already has: homework, revision and practice. They can ask for help within the subjects we support, and the supervisor responds when available, but it isn't a lesson or a replacement for a tutor.",
          "Study + Tutoring includes one hour of tutoring for each session your child attends; the rest of the session is supervised independent study. Email {email} to request the hour and the supervisor will schedule it within the session. Tutoring covers the subjects we support and is never a private one-to-one video call.",
        ],
      },
      {
        id: "supervision",
        q: "How does online supervision work?",
        a: [
          "Your child joins a scheduled group video room on Zoom or Google Meet from their Study Hall page, with the camera on their hands and desk. Showing their face is optional.",
          "A supervisor watches the live room, keeps the shared timer, makes factual notes such as a phone in use, and handles help requests.",
        ],
      },
      {
        id: "recording",
        q: "Is webcam footage recorded?",
        a: [
          "Study Hall doesn't record or store video, images or audio. The video room itself runs on Zoom or Google Meet, which process the call under their own privacy terms.",
        ],
      },
      {
        id: "stuck",
        q: "What happens if my child gets stuck?",
        a: [
          "They send a short help request with the subject and what they're stuck on, and can see whether it's open, being handled or resolved. The session supervisor responds by text in the app, or in a breakout room with at least two students or a second adult.",
          "Help covers the subjects we currently support: {subjects}. It depends on the supervisor rostered for that session, so not every subject can be covered at every moment.",
          "Response times depend on how busy the session is; there's no guaranteed response time, and it's never a private one-to-one video call.",
        ],
      },
      {
        id: "report",
        q: "What will I receive after each session?",
        a: [
          "A short email: when your child arrived and left, the goals they set and how they marked them, and any factual notes from the supervisor. If they didn't attend, a one-line note about 15 minutes after the session ends.",
        ],
      },
      {
        id: "alongside",
        q: "Can my child join alongside existing tutoring?",
        a: [
          "Yes. Study Hall is a place to do the homework and practice between lessons, so it can sit alongside tutoring. Your child can come to the sessions that fit around other commitments.",
        ],
      },
      {
        id: "billing",
        q: "How do subscriptions, cancellations and refunds work?",
        a: [
          "Prices are per student and billed weekly in Australian dollars through Stripe. You can change your card or cancel from your account and keep access until the end of your paid week.",
          "If Study Hall isn't right for you, email {email} within 7 days of your first payment and we'll refund it. Refunds aren't available after that.",
        ],
      },
      {
        id: "missed",
        q: "What happens if a session is cancelled or my child misses it?",
        a: [
          "If Study Hall cancels a session, everyone booked into it gets a credit to attend another session instead.",
          "If your child misses a session, you'll get a one-line note saying they didn't attend. They can come to any other session that week.",
        ],
      },
      {
        id: "needs",
        q: "What does my child need?",
        a: [
          "A laptop or tablet with a camera, a reliable internet connection, and a desk. They join the video room from the Join button on their Study Hall page.",
        ],
      },
      {
        id: "supervisors",
        q: "Who are the supervisors?",
        a: [
          "Our supervisors are current medical students with years of tutoring and teaching experience.",
          "Every supervisor holds a Working with Children Check that we've verified. We track expiry dates, and no one can be assigned to a session without a current check.",
        ],
      },
      {
        id: "signup",
        q: "Can my child sign up on their own?",
        a: [
          "No. A parent creates every student account and agrees to the house rules and privacy notice first. Your child then gets an email invite to log in.",
        ],
      },
      {
        id: "contact",
        q: "How do I contact Study Hall?",
        a: ["Email {email} with questions, concerns about the service, or a request to delete your child's data."],
      },
    ],
  },
  end: {
    title: "See whether Study Hall fits your week.",
    primary: "View plans",
    secondary: "Read the FAQ",
  },
  footer: {
    tagline: "Structured after-school study with live supervision, for students in Victoria.",
    nav: "Footer",
    houseRules: "House rules",
    safety: "Safety & privacy",
    privacy: "Privacy notice",
    logIn: "Log in",
    contact: "Contact",
  },
};

export type LandingCopy = typeof landingEn;
