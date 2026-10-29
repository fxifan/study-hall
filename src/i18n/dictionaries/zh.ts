import type { Dictionary } from "./en";
import { landingZh } from "./landing.zh";

/** Simplified Chinese (zh-CN). Parents are addressed as 您, students as 你. "Study Hall" stays as the brand. */
export const zh: Dictionary = {
  meta: {
    description: "为 VCE 学生提供有老师监督的线上自习，周一至周四 16:00–20:00。",
  },
  common: {
    loading: "加载中…",
    logOut: "退出登录",
    phase: "第 {n} 阶段",
  },
  roles: { parent: "家长", student: "学生", proctor: "监督老师", admin: "管理员" },
  studentStatus: { invited: "已邀请", active: "使用中", paused: "已暂停", cancelled: "已取消" },
  formats: { longDate: "M月d日 EEEE", time: "HH:mm" },
  landing: landingZh,
  login: {
    title: "登录",
    description: "我们会把登录链接发到您的邮箱，无需密码。",
    emailLabel: "邮箱",
    emailPlaceholder: "you@example.com",
    submit: "发送登录链接",
    sending: "发送中…",
    sent: "如果 {email} 已注册 Study Hall，登录链接正在发送中，一小时内有效。",
    errors: {
      invalid_email: "请输入有效的邮箱地址。",
      rate_limited: "登录邮件发送太频繁，请等一分钟再试。",
      send_failed: "暂时无法发送链接，请稍后再试。",
    },
    linkErrors: {
      link: "这个登录链接已过期或已被使用，请在下方重新获取。",
      "no-profile": "您的账户尚未设置完成。如果问题持续，请联系 Study Hall。",
    },
  },
  parent: {
    heading: "您的孩子",
    empty: "还没有添加学生。",
    yearStatus: "{year} 年级 · {status}",
    reportsSoon: "每晚的学习报告和出勤记录将显示在这里。",
  },
  student: {
    greeting: "{name}，你好",
    greetingFallback: "你好",
    year: "{year} 年级",
    sessionSoon: "今天的自习、你的学习目标、加入按钮和计时器将显示在这里。",
  },
  proctor: {
    heading: "今天的自习",
    melbourneTime: "墨尔本时间",
    room: "自习室",
    empty: "今天没有分配给您的自习。",
    rosterSoon: "实时名单、专注标记和求助队列将在每节自习中开放。",
  },
  admin: {
    heading: "概览",
    students: "学生",
    rooms: "自习室",
    plans: "套餐",
    perInterval: { week: "周" },
    inactive: "已停用",
    manageSoon: "自习室、课表、套餐和监督老师（WWCC）管理。",
  },
  legal: {
    draft: "草稿：本声明尚未经过审核，将在 Study Hall 正式开放前替换。",
    englishOnly: "法律文件目前仅提供英文版本。",
    version: "版本 {version} · 发布于 {date}",
  },
};
