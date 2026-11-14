import type { Locale } from "@/i18n/config";

/**
 * Copy for the Edumi home page (/). Edumi's core is studying with friends (docs/student-social.md);
 * Study Hall and Edumi for Tutors sit beside it. Every feature listed here exists in the product
 * today. English and Simplified Chinese.
 */
const en = {
  meta: {
    title: "Edumi · Outstudy your friends",
    description: "Race your friends up a live leaderboard while every minute fills one shared goal. Quiz yourself, climb the ranks, and get help when you're stuck.",
  },
  nav: { label: "Products", students: "For students", studyHall: "Study Hall", tutors: "For tutors", logIn: "Log in", menu: "Menu", join: "Start free" },
  hero: {
    eyebrow: "For students 13+ · first week free",
    title: "Outstudy your friends. Win together.",
    lede: "Every minute you study moves you up your group's live leaderboard and fills the goal you all share. Take the top spot, claim the day, then push until the whole group hits the target.",
    primary: "Challenge your friends",
    secondary: "For parents: Study Hall",
    visualLabel: "Illustration: a fictional study group's live leaderboard, daily goal and practice quiz",
    visualNote: "Illustrative, with fictional details",
    goal: "Today's goal",
    left: "4h 10m to go together",
    board: "Live leaderboard · today",
    live: "studying now",
    you: "You",
    yourMove: "your move",
    standout: "Yesterday's standout: Leo K. · 2h 40m",
    quiz: "Practice quiz · Chain rule",
    score: "7 / 8 · +10 XP",
    tier: "Silver Striver · 40 XP to Gold Grinder",
    liveTag: "Live",
    goalShort: "Group goal",
    goalOf: "1h 50m of 6h",
    quizScore: "10 / 12",
    proof: [
      { value: "1 goal", label: "shared by your whole group" },
      { value: "8", label: "question quizzes, marked" },
      { value: "A$0", was: "A$11.99", label: "for 7 days, then A$11.99 a month" },
    ],
  },
  app: {
    label: "Inside the app",
    title: "Everything for tonight's study, on one screen.",
    goal: "Today's goal",
    goalLine: "1h 50m of 6h · 4h 10m to go together",
    timer: "Counting · Methods crew",
    pause: "Pause",
    stop: "Stop",
    chat: [
      { kind: "sys", text: "Leo K. just started studying. 4 hours 10 minutes left on today's goal." },
      { kind: "them", text: "doing the chain rule sheet, check answers after?" },
      { kind: "me", text: "yes, I'm on q6" },
      { kind: "help", text: "Call out · Ava S. has a question: q9, why is the derivative of ln(2x) just 1/x?" },
    ],
    board: "Today",
    week: "Week",
    tier: "Your rank",
    tierName: "Silver Striver",
    toNext: "40 XP to Gold Grinder",
  },
  products: {
    label: "Products",
    title: "Edumi runs on a little friendly rivalry.",
    students: {
      status: "Live",
      name: "Edumi",
      for: "For students 13+",
      body: "Make a group, set a daily goal in combined minutes, and find out who's really putting in the work. Everyone's minutes race up the board and add up to the same target.",
      points: [
        "Live group leaderboard and a Friends board, daily and weekly",
        "A daily standout named when the day closes",
        "Verified study timer: every minute on the board is earned",
        "AI practice: 2 quizzes of 8 questions a day, plus 13 Study Ranks to climb",
        "Call Out for Help when you're stuck",
        "7 days free, then A$11.99/month, paid by you or a parent",
      ],
      cta: "Challenge your friends",
    },
    studyHall: {
      status: "Live",
      name: "Edumi Study Hall",
      for: "For students and families",
      body: "Supervised online study sessions for Years 7–12. Students plan their goals, study with a supervisor present, and parents get a report after every session.",
      points: [
        "Scheduled sessions with a live supervisor",
        "Goals set before, marked before leaving",
        "Help requests answered in the app",
        "A report for parents in English or 中文",
      ],
      cta: "Explore Study Hall",
    },
    tutors: {
      status: "Live",
      name: "Edumi for Tutors",
      for: "For independent tutors",
      body: "Speak for a minute after a lesson. Get a factual parent update in English, Simplified Chinese or both, in about 60 seconds, with the session logged for invoicing.",
      points: [
        "Voice note to parent update in about 60 seconds",
        "English, 中文, or both side by side",
        "Lessons, students and class links in one calendar",
        "Invoices with or without GST, with your bank details",
      ],
      cta: "See Edumi for Tutors",
    },
  },
  features: {
    label: "What's in Edumi today",
    title: "Built for studying, and the work around it.",
    items: [
      { tag: "Students", title: "Live leaderboard", body: "See who's studying right now and who's on top today or this week. Ties share the spot." },
      { tag: "Students", title: "Daily standout", body: "When the day closes, the group recap names whoever put in the most minutes. Tomorrow it could be you." },
      { tag: "Students", title: "No fake minutes", body: "The timer counts only while an Edumi study page is open and you're active. Nobody games the board." },
      { tag: "Students", title: "Climb the ranks", body: "Quiz marks and finished notes earn XP. Climb 13 Study Ranks, from Copper Crammer to Grandmaster Genius." },
      { tag: "Study Hall", title: "Live supervision", body: "A supervisor in every session; camera on hands and desk, never recorded by Edumi." },
      { tag: "Study Hall", title: "Goals and check-ins", body: "Students set up to three tasks per session and mark each one before they leave." },
      { tag: "Study Hall", title: "Parent reports", body: "Attendance, goals and supervisor notes, reviewed and sent in English or 中文." },
      { tag: "Study Hall", title: "Child-safety first", body: "Checked supervisors, logged messages, no private one-to-one video." },
      { tag: "Tutors", title: "Voice to report", body: "Talk for a minute; review an AI draft of only what you said before anything is sent." },
      { tag: "Tutors", title: "Bilingual updates", body: "English, Simplified Chinese, or both, ready to paste into WeChat or email." },
      { tag: "Tutors", title: "Invoices", body: "Turn logged sessions into invoices or tax invoices in a couple of taps." },
      { tag: "Tutors", title: "Practice sets", body: "AI practice questions and writing tips built on the Victorian curriculum, checked by you." },
    ],
  },
  closing: {
    title: "Think you can outstudy them? Prove it.",
    join: "Challenge your friends",
    studyHall: "Explore Study Hall",
    tutors: "Start a free tutor trial",
  },
  footer: {
    tagline: "Education, made intelligent.",
    students: "Edumi for students",
    studyHall: "Edumi Study Hall",
    tutors: "Edumi for Tutors",
    privacy: "Privacy",
    terms: "Terms",
    houseRules: "Study Hall house rules",
    tutorTerms: "Tutor terms",
    tutorPrivacy: "Tutor privacy",
    logIn: "Log in",
    contact: "Contact",
  },
};

export type HomeCopy = typeof en;

const zh: HomeCopy = {
  // The student product is English only (owner, 6 Nov 2026): its copy is shared with en.
  meta: en.meta,
  nav: { label: "产品", students: en.nav.students, studyHall: "Study Hall 自习", tutors: "老师版", logIn: "登录", menu: "菜单", join: en.nav.join },
  hero: en.hero,
  app: en.app,
  products: {
    label: "产品",
    title: en.products.title,
    students: en.products.students,
    studyHall: {
      status: "已上线",
      name: "Edumi Study Hall",
      for: "面向学生和家庭",
      body: "为 7–12 年级学生提供有老师监督的线上自习。学生先定好目标，在监督老师陪同下学习，每节结束后家长都会收到报告。",
      points: ["按时开放、真人监督的自习", "开始前设定目标，离开前逐项标记", "在应用内提问并获得回复", "中英文家长报告"],
      cta: "了解 Study Hall",
    },
    tutors: {
      status: "已上线",
      name: "Edumi for Tutors",
      for: "面向独立家教老师",
      body: "课后说一分钟，约 60 秒即可得到一份客观的家长反馈（英文、简体中文或双语），课时同时记录，方便开票。",
      points: ["语音记录约 60 秒生成家长反馈", "英文、中文或双语对照", "课程、学生和上课链接集中在一个日历", "可开含 GST 或不含 GST 的发票，附银行信息"],
      cta: "了解老师版",
    },
  },
  features: {
    label: "Edumi 现有功能",
    title: "为学习本身，以及学习背后的事务而设计。",
    items: [
      ...en.features.items.filter((f) => f.tag === "Students"),
      { tag: "Study Hall", title: "真人监督", body: "每节都有监督老师在场；摄像头对准双手和书桌，Edumi 不录像。" },
      { tag: "Study Hall", title: "目标与检查", body: "学生每节最多设定三项任务，离开前逐项标记。" },
      { tag: "Study Hall", title: "家长报告", body: "出勤、目标和监督老师备注，经审核后以中文或英文发送。" },
      { tag: "Study Hall", title: "儿童安全优先", body: "监督老师经过核查，消息全程记录，绝无一对一私人视频。" },
      { tag: "老师版", title: "语音生成报告", body: "说一分钟；AI 只根据您说的内容起草，发送前由您审核。" },
      { tag: "老师版", title: "双语反馈", body: "英文、简体中文或双语，可直接粘贴到微信或邮件。" },
      { tag: "老师版", title: "开具发票", body: "已记录的课时一两步即可生成发票或税务发票。" },
      { tag: "老师版", title: "练习题", body: "基于维州课程大纲的 AI 练习题和写作建议，由您审核后使用。" },
    ],
  },
  closing: { title: en.closing.title, join: en.closing.join, studyHall: "了解 Study Hall", tutors: "开始老师版免费试用" },
  footer: {
    tagline: "Education, made intelligent.",
    students: en.footer.students,
    studyHall: "Edumi Study Hall",
    tutors: "Edumi for Tutors",
    privacy: "隐私",
    terms: "条款",
    houseRules: "Study Hall 自习规则",
    tutorTerms: "老师版条款",
    tutorPrivacy: "老师版隐私",
    logIn: "登录",
    contact: "联系我们",
  },
};

export function homeCopy(locale: Locale): HomeCopy {
  return locale === "zh" ? zh : en;
}
