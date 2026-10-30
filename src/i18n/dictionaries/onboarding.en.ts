/**
 * Sign-up (onboarding) copy, English. Shape is the source for onboarding.zh.ts.
 * Product brief §7: before paying, parents see the real operating model and terms.
 */
export const onboardingEn = {
  title: "Sign up",
  intro: "Set up your family in a few minutes: add your child, agree to the house rules, then pay securely with Stripe.",
  included: {
    title: "Before you pay",
    items: [
      "Live group supervision, Monday to Thursday, 4:00–8:00pm Melbourne time. Your child can come to as many sessions as suits.",
      "Academic help when your child gets stuck, within the subjects we currently support ({subjects}), by text in the app or in a small group. On Supervised Study the supervisor responds when available, with no guaranteed response time. Study + Tutoring includes one hour of one-to-one tutoring for each session your child attends, in the main session room, scheduled by the supervisor when you request it; the rest of the session is supervised independent study. Help is never a private call or breakout with one adult.",
      "Camera on hands and desk; face optional. Study Hall doesn't record video, images or audio. The room runs on Zoom or Google Meet.",
      "Every supervisor holds a Working with Children Check that we've verified. An adult is never alone on video with your child.",
      "After each session you get a short report: attendance, goals, and factual notes from the supervisor.",
    ],
    billing: "From {price} per student per week, billed weekly by Stripe. Cancel any time and keep access until the end of your paid week. Refundable within 7 days of your first payment; refunds aren't available after that.",
  },
  start: {
    title: "Create your parent account",
    body: "Enter your email and we'll send a link to continue. No password needed.",
    email: "Your email",
    submit: "Email me a link",
    sent: "Check your email for a link to continue. It expires in an hour.",
    haveAccount: "Already signed up?",
    logIn: "Log in",
    errors: {
      invalid_email: "Enter a valid email address.",
      rate_limited: "You just asked for a link. Wait a minute and try again.",
      email_quota: "We can't send sign-up emails right now. Please try again in a little while.",
      send_failed: "We couldn't send the link. Try again shortly.",
    },
  },
  steps: { details: "Your details", children: "Your children", consent: "House rules and privacy", pay: "Plan and payment" },
  details: {
    name: "Your name",
    source: "How did you hear about Study Hall? (optional)",
    sources: {
      none: "Prefer not to say",
      wechat_referral: "WeChat group or contact",
      parent_referral: "Another parent",
      social_media: "Social media",
      search: "Search engine",
      other: "Other",
    },
    sourceHelp: "Only used to see which channels work. We don't collect social media details.",
    save: "Save",
  },
  children: {
    empty: "Add each child who'll join Study Hall.",
    firstName: "First name",
    lastInitial: "Last initial",
    yearLevel: "Year level",
    year: "Year {n}",
    school: "School (optional)",
    email: "Your child's email (they log in with this)",
    add: "Add child",
    remove: "Remove",
    minimisation: "We only ask for what we need: no birthday, photo, address or phone number.",
    status: { invited: "Login email sent after payment", active: "Active", paused: "Paused", cancelled: "Cancelled" },
    errors: {
      invalid: "Check the details and try again.",
      email_taken: "That email already has a Study Hall account.",
      failed: "Couldn't add your child. Try again.",
    },
  },
  consent: {
    intro: "Your child sees these rules before every session.",
    privacyIntro: "How we handle your family's information:",
    privacyLink: "Privacy & child safety notice",
    draftNote: "(draft, under review)",
    houseRules: "I've read the house rules, and my child agrees to follow them.",
    privacy: "I've read the privacy & child safety notice, and I consent to Study Hall handling my child's information as it describes.",
    submit: "Agree",
    done: "Agreed: house rules {rules}, privacy notice {privacy}.",
    needChildren: "Add a child first.",
    required: "Tick both boxes to continue.",
  },
  pay: {
    summary: "{count} × {price} = {total} per week",
    terms: [
      "Billed weekly in Australian dollars by Stripe; Study Hall never sees your card details.",
      "Cancel any time from your account and keep access until the end of your paid week.",
      "Not right for you? Ask within 7 days of your first payment and we'll refund it. Refunds aren't available after that.",
      "Questions before you pay? Email {email}.",
    ],
    submit: "Continue to secure payment",
    needConsent: "Add a child and agree to the rules first.",
    needSubjects: "The tutoring plan needs at least one subject for each child, so their tutor can prepare.",
    tutoring: "Includes one hour of one-to-one tutoring per session attended, scheduled by the supervisor when you request it. The rest of the session is supervised independent study. Tutoring happens in the main session room with the supervisor and other students present, never in a private call, and covers the subjects we support.",
    supervision: "Live group supervision, goals and progress tracking, academic help requests within the subjects we support when the supervisor is available, and a report after each session. No dedicated tutoring hour.",
    notConfigured: "Payments aren't switched on yet.",
    cancelled: "Payment was cancelled. Nothing was charged.",
    failed: "Couldn't start payment. Try again shortly.",
  },
  done: {
    title: "You're all set",
    body: "Your child will get an email with a link to log in. Reports and billing are on your page.",
    link: "Go to your page",
  },
  complete: {
    failed: "We couldn't confirm the payment yet. It can take a minute: check your page shortly.",
  },
};

export type OnboardingCopy = typeof onboardingEn;
