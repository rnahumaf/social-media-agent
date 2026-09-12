export type Card = { title: string; body: string };
export type Revision = {
  id: string;
  article: string;
  caption: string;
  cards: Card[];
  createdAt: string;
};
export type Project = {
  id: string;
  title: string;
  brief: string;
  query: string;
  status: string;
  sources: {
    title: string;
    pmid: string;
    abstract: string;
    access: string;
    url: string;
  }[];
  messages: {
    role: string;
    content: string;
    agent?: string;
    internal?: boolean;
    at: string;
  }[];
  runs: {
    id: string;
    role: string;
    model: string;
    status: string;
    usage?: { total_tokens?: number; cost?: number };
  }[];
  revisions: Revision[];
  approval: Record<string, string> | null;
  publications: Record<
    string,
    { status: string; remoteId?: string; url?: string }
  >;
};
export type State = {
  format: 1;
  name: string;
  memory: string;
  unlocked?: boolean;
  settings: {
    demo: boolean;
    models: Record<string, string>;
    wordpressUrl: string;
    wordpressUser: string;
    instagramAccount: string;
    graphVersion: string;
  };
  projects: Project[];
};
export type API = Record<string, (payload?: any) => Promise<any>>;
declare global {
  interface Window {
    studio?: API;
  }
}
