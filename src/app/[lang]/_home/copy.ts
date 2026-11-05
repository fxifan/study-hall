import type { Locale } from "@/i18n/config";

/**
 * Copy for the Edumi home page (/). Every feature listed here exists in the product today; Edumi AI
 * is deliberately described only as unavailable. English and Simplified Chinese.
 */
const en = {
  meta: {
    title: "Edumi · Education, made intelligent",
    description: "Edumi: supervised online study for students and families, and an AI-powered workspace for independent tutors.",
  },
  nav: { label: "Products", studyHall: "Study Hall", tutors: "For tutors", ai: "Edumi AI", logIn: "Log in", menu: "Menu" },
  hero: {
    eyebrow: "One workspace for learning",
    title: "Education, made intelligent.",
    lede: "Edumi brings supervised study, AI-assisted parent updates and the admin around tutoring into one place.",
    primary: "Explore Study Hall",
    secondary: "Edumi for Tutors",
    visualLabel: "Illustration: a fictional tutor's parent update and a Study Hall session",
    visualNote: "Illustrative, with fictional details",
  },
  products: {
    label: "Products",
    title: "Pick the part of Edumi you need.",
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
    ai: {
      status: "Unavailable yet",
      name: "Edumi AI",
      body: "Not available yet.",
    },
  },
  features: {
    label: "What's in Edumi today",
    title: "Built for the work around learning.",
    items: [
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
    title: "Start with the part that fits.",
    studyHall: "Explore Study Hall",
    tutors: "Start a free tutor trial",
  },
  footer: {
    tagline: "Education, made intelligent.",
    studyHall: "Edumi Study Hall",
    tutors: "Edumi for Tutors",
    privacy: "Privacy",
    houseRules: "Study Hall house rules",
    tutorTerms: "Tutor terms",
    tutorPrivacy: "Tutor privacy",
    logIn: "Log in",
    contact: "Contact",
  },
};

export type HomeCopy = typeof en;

const zh: HomeCopy = {
  meta: {
    title: "Edumi · Education, made intelligent",
    description: "Edumi：为学生和家庭提供有老师监督的线上自习，并为独立家教老师提供智能工作台。",
  },
  nav: { label: "产品", studyHall: "Study Hall 自习", tutors: "老师版", ai: "Edumi AI", logIn: "登录", menu: "菜单" },
  hero: {
    eyebrow: "一体化学习平台",
    title: "Education, made intelligent.",
    lede: "Edumi 把有监督的自习、AI 辅助的家长反馈，以及辅导相关的日常事务整合在一起。",
    primary: "了解 Study Hall",
    secondary: "Edumi 老师版",
    visualLabel: "示意图：虚构的家教老师家长反馈，以及一节 Study Hall 自习",
    visualNote: "示意图，内容均为虚构",
  },
  products: {
    label: "产品",
    title: "选择适合您的 Edumi。",
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
    ai: { status: "暂未开放", name: "Edumi AI", body: "暂未开放。" },
  },
  features: {
    label: "Edumi 现有功能",
    title: "为学习背后的事务而设计。",
    items: [
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
  closing: { title: "从最适合您的部分开始。", studyHall: "了解 Study Hall", tutors: "开始老师版免费试用" },
  footer: {
    tagline: "Education, made intelligent.",
    studyHall: "Edumi Study Hall",
    tutors: "Edumi for Tutors",
    privacy: "隐私",
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
