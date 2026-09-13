export type Card = { title: string; body: string };
export type Revision = {
  id: string;
  article: string;
  caption: string;
  cards: Card[];
  createdAt: string;
};
export type RunEvent = {
  id: string;
  at: string;
  kind: "status" | "tool_call" | "tool_result" | "output" | "error" | "user";
  role?: string;
  title: string;
  detail?: string;
};
export type RunSession = {
  id: string;
  status: string;
  cursor: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
  instruction?: string;
  events: RunEvent[];
  artifacts?: {
    query?: string;
    sources?: Project["sources"];
    dossier?: string;
    article?: string;
    social?: { caption: string; cards: Card[] };
    responses?: {
      id: string;
      role: string;
      phase?: string;
      content: string;
      at: string;
    }[];
  };
  revisionId?: string;
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
    phase?: string;
    model: string;
    status: string;
    usage?: { total_tokens?: number; cost?: number };
    error?: string;
    sessionId?: string;
    startedAt?: string;
    finishedAt?: string;
  }[];
  sessions?: RunSession[];
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
  vaultRemembered?: boolean;
  vaultRememberError?: string;
  openrouterConfigured?: boolean;
  instagramMediaConfigured?: boolean;
  settings: {
    demo: boolean;
    models: Record<string, string>;
    wordpressUrl: string;
    wordpressUser: string;
    wordpressProvider?: "selfhosted" | "wordpress.com";
    wordpressSiteId?: string;
    wordpressSiteName?: string;
    bloggerId?: string;
    bloggerUrl?: string;
    bloggerName?: string;
    bloggerBlogs?: { id: string; name: string; url: string }[];
    instagramAccount: string;
    instagramUsername?: string;
    instagramExpiresAt?: number;
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
