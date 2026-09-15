import type { Project, State } from "../src/types";
export function publicationView(project: Project, state: State, channel: string, options?: {
  desktop?: boolean; busy?: boolean; dirty?: boolean; awaitingCards?: boolean;
}): { mode: string; status: string; reason: string; label: string; canApprove: boolean; canPublish: boolean; canCheck: boolean };
