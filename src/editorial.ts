import type { CardStyle, Knowledge, State, Project } from "./types";
export const defaultStyle: CardStyle = {
  layout: "text",
  background: "#f5f3ed",
  titleColor: "#193d32",
  textColor: "#394e46",
  accent: "#226453",
  font: "sans",
  fontScale: 1,
  signature: "ESTÚDIO EDITORIAL",
};
export const knowledgeOf = (s: State): Knowledge =>
  s.knowledge || { general: s.memory, blog: "", instagram: "", examples: "" };
export const channelsOf = (p: Project) => p.channels || ["blog", "instagram"];
