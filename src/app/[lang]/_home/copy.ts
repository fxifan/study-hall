import type { Locale } from "@/i18n/config";

/**
 * Copy for the Edumi home page (/). Edumi's core is studying with friends (docs/student-social.md);
 * Study Hall and Edumi for Tutors sit beside it. Every feature listed here exists in the product
 * today. English and Simplified Chinese.
 */
const en = {
  meta: {
    title: "Edumi · Study with your friends",
    description: "Set a study goal with your friends. Every minute counts for the group. Quiz yourself, level up, and get help when you're stuck.",
  },
  nav: { label: "Products", students: "For students", studyHall: "Study Hall", tutors: "For tutors", logIn: "Log in", menu: "Menu", join: "Start free" },
  hero: {
    eyebrow: "For students 13+ · first week free",
    title: "Study together. Every minute counts.",
    lede: "Set a study goal with your friends. Every minute counts for the group. Quiz yourself, level up, and get help when you're stuck.",
    primary: "Start your free week",
    secondary: "For parents: Study Hall",
    visualLabel: "Illustration: a fictional study group's daily goal, chat and practice quiz",
    visualNote: "Illustrative, with fictional details",
    goal: "Today's goal",
    left: "4h 10m to go together",
    started: "Leo K. just started studying. 4 hours 10 minutes left on today's goal.",
    help: "Ava S. has a question: q9, why is the derivative of ln(2x) just 1/x?",
    quiz: "Practice quiz · Chain rule",
    score: "7 / 8 · +10 points",
  },
  products: {
    label: "Products",
    title: "Edumi starts with your friends.",
    students: {
      status: "Live",
      name: "Edumi",
      for: "For students 13+",
      body: "Make a group, set a daily goal in combined minutes, and watch it fill up as everyone studies. Then quiz yourself and ask the group when you're stuck.",
      points: [
        "Shared daily goal with a verified study timer",
        "Group chat, live group boards and a Friends board",
        "Call Out for Help: a question, a study buddy or a check-in",
        "AI practice: 2 quizzes of 8 questions a day, plus notes and flashcards",
        "7 days free, then A$11.99/month, paid by you or a parent",
      ],
      cta: "Start your free week",
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
      { tag: "Students", title: "A goal you share", body: "Six hours across three friends? Every verified minute anyone studies brings the group closer." },
      { tag: "Students", title: "Time that's real", body: "The timer counts only while an Edumi study page is open and you're active. One timer across all your devices." },
      { tag: "Students", title: "Call Out for Help", body: "Ask one friend or the whole group. They accept, you mark it sorted. You choose when to ask." },
      { tag: "Students", title: "Practice and tiers", body: "Quizzes marked on the server, flashcards and notes from your own notes. Points for finishing, private to you." },
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
    title: "Start with your friends.",
    join: "Start your free week",
    studyHall: "Explore Study Hall",
    tutors: "Start a free tutor trial",
  },
  footer: {
    tagline: "Education, made intelligent.",
    students: "Edumi for students",
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
    title: "Edumi · 和朋友一起学习",
    description: "和朋友一起设定学习目标，每一分钟都为小组加油。自测练习、升级，卡住时随时求助。",
  },
  nav: { label: "产品", students: "学生版", studyHall: "Study Hall 自习", tutors: "老师版", logIn: "登录", menu: "菜单", join: "免费开始" },
  hero: {
    eyebrow: "面向 13 岁以上学生 · 首周免费",
    title: "一起学习，每分钟都算数。",
    lede: "和朋友一起设定学习目标，每一分钟都为小组加油。自测练习、升级，卡住时随时求助。",
    primary: "免费试用一周",
    secondary: "家长请看：Study Hall",
    visualLabel: "示意图：虚构学习小组的每日目标、聊天和练习测验",
    visualNote: "示意图，内容均为虚构",
    goal: "今日目标",
    left: "还差 4 小时 10 分钟",
    started: "Leo K. 开始学习了。今天的目标还差 4 小时 10 分钟。",
    help: "Ava S. 提问：第 9 题，为什么 ln(2x) 的导数是 1/x？",
    quiz: "练习测验 · 链式法则",
    score: "7 / 8 · +10 分",
  },
  products: {
    label: "产品",
    title: "Edumi，从朋友开始。",
    students: {
      status: "已上线",
      name: "Edumi",
      for: "面向 13 岁以上学生",
      body: "建一个小组，设定每日合计学习时长目标，大家学习时进度条一起往前走。还能自测练习，卡住时向小组求助。",
      points: [
        "共同的每日目标和经过验证的学习计时",
        "小组聊天、小组实时排行和好友排行",
        "求助：提问、找学习伙伴或简单确认",
        "AI 练习：每天 2 套 8 题测验，另有笔记和闪卡",
        "首 7 天免费，之后每月 A$11.99，学生或家长付款",
      ],
      cta: "免费试用一周",
    },
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
      { tag: "学生", title: "共同的目标", body: "三个朋友一天六小时？任何人每一分钟经过验证的学习都让小组更接近目标。" },
      { tag: "学生", title: "真实的时间", body: "只有打开 Edumi 学习页面并在使用时才计时。所有设备共用一个计时器。" },
      { tag: "学生", title: "求助", body: "问一位朋友或整个小组。对方接受，你标记已解决。何时求助由你决定。" },
      { tag: "学生", title: "练习与等级", body: "测验在服务器评分，可根据你的笔记生成闪卡和笔记。完成即得分，分数只有你自己可见。" },
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
  closing: { title: "从朋友开始。", join: "免费试用一周", studyHall: "了解 Study Hall", tutors: "开始老师版免费试用" },
  footer: {
    tagline: "Education, made intelligent.",
    students: "Edumi 学生版",
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
