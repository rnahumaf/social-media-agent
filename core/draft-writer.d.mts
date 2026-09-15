export type DraftStatus = { pending: boolean; saving: boolean; error: string };
export function createDraftWriter(
  write: (payload: any) => Promise<any>,
  delay?: number,
): {
  schedule(payload: any): void;
  flush(): Promise<void>;
  getSnapshot(): DraftStatus;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};
