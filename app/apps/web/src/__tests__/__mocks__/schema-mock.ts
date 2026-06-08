/**
 * Shared mock for @/db/schema — generates stub column references for all tables.
 * Each table export is an object where keys = column names with string values.
 * This prevents "No export defined on mock" errors after schema splits.
 */

const col = (name: string) => name;

const makeTable = (...cols: string[]) => {
  const t: Record<string, string> = {};
  for (const c of cols) t[c] = c;
  return t;
};

const baseFields = ["id", "tenantId", "createdAt", "updatedAt"];

export const tenants = makeTable("id", "name", "settings", "domain", "createdAt", "updatedAt", "stripeCustomerId", "subscriptionId", "subscriptionStatus", "plan", "referralCode");
export const users = makeTable(...baseFields, "email", "name", "role", "authUserId", "avatarUrl", "lastActiveAt");
export const companies = makeTable(...baseFields, "name", "domain", "industry", "size", "description", "properties", "score", "lifecycleStage", "fundingStage", "totalRaised", "location", "foundedYear");
export const contacts = makeTable(...baseFields, "companyId", "firstName", "lastName", "email", "phone", "title", "seniority", "linkedinUrl", "properties", "score", "lastActivityAt", "source");
export const deals = makeTable(...baseFields, "companyId", "contactId", "name", "stage", "value", "expectedCloseDate", "lostReason", "properties", "closedAt", "sentiment");
export const activities = makeTable(...baseFields, "entityId", "entityType", "activityType", "direction", "sentiment", "occurredAt", "summary", "intent", "metadata", "rawBody", "messageId", "threadId");
export const notes = makeTable(...baseFields, "entityId", "entityType", "body", "authorId");
export const tasks = makeTable(...baseFields, "entityId", "entityType", "title", "description", "dueDate", "status", "assigneeId", "completedAt");
export const sequences = makeTable(...baseFields, "name", "status", "methodology", "contactId", "companyId");
export const sequenceSteps = makeTable(...baseFields, "sequenceId", "stepNumber", "subject", "body", "delayDays");
export const sequenceEnrollments = makeTable(...baseFields, "sequenceId", "contactId", "status", "currentStep", "enrolledAt", "completedAt");
export const outboundEmails = makeTable(...baseFields, "sequenceEnrollmentId", "stepNumber", "to", "subject", "body", "status", "sentAt", "openedAt", "repliedAt", "bouncedAt", "metadata");
export const chatThreads = makeTable(...baseFields, "userId", "title", "surface", "entityId", "entityType", "parentMessageId", "branchId");
export const chatMessages = makeTable(...baseFields, "threadId", "role", "content", "toolCalls", "metadata");
export const chatMemories = makeTable(...baseFields, "threadId", "scope", "content", "category");
export const knowledgeEntries = makeTable(...baseFields, "title", "content", "category", "metadata");
export const agentTraces = makeTable(...baseFields, "agentId", "agentCategory", "traceId", "parentSpanId", "input", "output", "model", "status", "inputTokens", "outputTokens", "estimatedCost", "latencyMs", "toolCalls", "toolCallsCount", "errorMessage", "correctionApplied", "evalScore", "metadata");
export const agentPromptVersions = makeTable(...baseFields, "agentId", "version", "prompt", "fewShotExamples", "isActive", "evalScore");
export const agentFewShotExamples = makeTable(...baseFields, "agentId", "input", "output", "score", "isActive");
export const agentFailurePatterns = makeTable(...baseFields, "agentId", "pattern", "frequency", "lastSeen", "resolution");
export const evalDatasets = makeTable(...baseFields, "name", "description", "agentId");
export const evalCases = makeTable(...baseFields, "datasetId", "input", "expectedOutput", "context", "tags");
export const evalRuns = makeTable(...baseFields, "datasetId", "status", "graderModel", "summary", "completedAt");
export const evalResults = makeTable(...baseFields, "runId", "caseId", "agentOutput", "score", "pass", "graderReasoning", "latencyMs", "toolCallsCount", "metadata");
export const contextGraphNodes = makeTable(...baseFields, "entityId", "entityType", "label", "embedding");
export const contextGraphEdges = makeTable(...baseFields, "sourceId", "targetId", "relation", "weight", "metadata");
export const connectedMailboxes = makeTable(...baseFields, "userId", "email", "emailAddress", "provider", "status", "accessToken", "refreshToken", "syncState");
export const pendingInvites = makeTable(...baseFields, "email", "role", "token", "expiresAt", "invitedBy");
export const savedViews = makeTable(...baseFields, "name", "entityType", "filters", "columns", "sort", "isDefault");
export const intelligenceBriefs = makeTable(...baseFields, "entityId", "entityType", "briefType", "content", "metadata");
export const toolCallEvents = makeTable(...baseFields, "messageId", "toolName", "args", "result", "snapshot", "undone");
export const sharedPrompts = makeTable(...baseFields, "title", "content", "isPublic");
export const comments = makeTable(...baseFields, "entityId", "entityType", "body", "authorId", "parentId");
export const userPreferences = makeTable(...baseFields, "userId", "key", "value");
export const notifications = makeTable(...baseFields, "userId", "type", "title", "body", "read", "metadata");
export const notificationPreferences = makeTable(...baseFields, "userId", "type", "enabled");
export const passwordResetTokens = makeTable("id", "email", "token", "expiresAt", "createdAt");
export const emailVerificationTokens = makeTable("id", "email", "token", "expiresAt", "createdAt");
export const failedSignInAttempts = makeTable("id", "email", "ip", "createdAt");
export const warmupEmails = makeTable(...baseFields, "mailboxId", "status", "sentAt");
export const importHistory = makeTable(...baseFields, "fileName", "entityType", "totalRows", "importedRows", "failedRows", "status");
export const customSignals = makeTable(...baseFields, "name", "type", "config");
export const systemTrustScore = makeTable(...baseFields, "score", "components");
export const trustEvents = makeTable(...baseFields, "eventType", "delta", "reason");
export const agentActions = makeTable(...baseFields, "agentId", "actionType", "entityId", "entityType", "summary", "approved", "metadata");
export const coachingInsights = makeTable(...baseFields, "dealId", "insight", "category", "priority");
export const autonomyConfig = makeTable(...baseFields, "agentId", "level", "rules");
export const promptExperiments = makeTable(...baseFields, "agentId", "name", "status", "variants", "metrics");

// Enums as plain objects
export const dealStageEnum = {};
export const sentimentEnum = {};
export const directionEnum = {};
export const activityTypeEnum = {};
export const outboundStatusEnum = {};
export const sequenceStatusEnum = {};
export const enrollmentStatusEnum = {};
export const channelEnum = {};
export const mailboxStatusEnum = {};
export const agentTraceStatusEnum = {};
export const evalRunStatusEnum = {};
export const notificationTypeEnum = {};
export const enrollmentStrategy = {};
export const pipelineStageEnum = {};
export const promptExperimentStatusEnum = {};
