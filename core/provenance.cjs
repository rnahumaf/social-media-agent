const { createHash } = require("node:crypto");
function reviewFingerprint(project, revision, reviewedChannels) {
  return createHash("sha256").update(JSON.stringify({
    revisionId: revision?.id,
    title: project.title,
    brief: project.brief,
    channels: [...(project.channels || ["blog", "instagram"])].sort(),
    reviewedChannels: [...reviewedChannels].sort(),
    article: reviewedChannels.includes("blog") ? revision?.article : undefined,
    caption: reviewedChannels.includes("instagram") ? revision?.caption : undefined,
    cards: reviewedChannels.includes("instagram") ? revision?.cards : undefined,
    sources: revision?.sources || [],
  })).digest("hex");
}
function reviewFeedback(project, revision = project.revisions.at(-1)) {
  const reviews = project.messages.filter(m => m.agent === "reviewer" && m.role === "assistant" && !m.internal);
  const exact = [...reviews].reverse().find(m => m.revisionId === revision?.id && m.reviewFingerprint);
  const found = exact || reviews.at(-1);
  if (!found) return { status: "none" };
  const reviewedChannels = found.reviewedChannels || [];
  const valid = !!revision && !!found.revisionId && found.revisionId === revision.id &&
    !!reviewedChannels.length && found.reviewFingerprint === reviewFingerprint(project, revision, reviewedChannels);
  return {
    status: valid ? "current" : found.revisionId ? "stale" : "legacy",
    content: found.content, at: found.at,
    revisionId: found.revisionId, channels: reviewedChannels,
  };
}
module.exports = { reviewFingerprint, reviewFeedback };
