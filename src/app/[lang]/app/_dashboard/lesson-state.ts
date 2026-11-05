import type { DashItem } from "./types";

/**
 * The lesson states, named and coloured the same everywhere (calendar, legend, lesson details,
 * upcoming list): booked = muted blue, happened but not logged = coral outline, logged = muted green.
 */
export type LessonState = "booked" | "due" | "logged" | "cancelled";

export function lessonState(item: Pick<DashItem, "status" | "isPast">): LessonState {
  if (item.status === "cancelled") return "cancelled";
  if (item.status === "done") return "logged";
  return item.isPast ? "due" : "booked";
}

export const STATE_LABEL: Record<LessonState, string> = {
  booked: "Booked",
  due: "Happened, not logged",
  logged: "Logged",
  cancelled: "Cancelled",
};

/** Calendar block classes. */
export const STATE_EVENT: Record<LessonState, string> = {
  booked: "dash-event dash-event--scheduled",
  due: "dash-event dash-event--due",
  logged: "dash-event dash-event--done",
  cancelled: "dash-event dash-event--cancelled",
};

/** Small tag classes. */
export const STATE_TAG: Record<LessonState, string> = {
  booked: "dash-tag dash-tag--blue",
  due: "dash-tag dash-tag--due",
  logged: "dash-tag dash-tag--green",
  cancelled: "dash-tag",
};
