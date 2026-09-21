export type ProgressStep = {
  id: string;
  label: string;
  detail: string;
  state:
    "complete" | "pending" | "active" | "paused" | "cancelled" | "interrupted";
};
export function runProgress(
  session: {
    status: string;
    cursor: string;
    mode?: string;
    channels?: string[];
  },
  projectChannels?: string[],
): { steps: ProgressStep[]; currentIndex: number; completed: number };
