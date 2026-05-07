export interface SendingDomain {
  id: string;
  tenantId: string;
  domain: string;
  status: "provisioning" | "dns_pending" | "warming_up" | "active" | "paused" | "retired";
  healthScore: number;
  spfConfigured: boolean;
  dkimConfigured: boolean;
  dmarcConfigured: boolean;
  warmupStartedAt: string | null;
  warmupCompletedAt: string | null;
  dailyCapacity: number;
  sentToday: number;
  bounceRate7d: number;
  complaintRate7d: number;
  createdAt: string;
}

export interface DomainHealthReport {
  domainId: string;
  domain: string;
  healthScore: number;
  metrics: {
    sentLast7d: number;
    bouncesLast7d: number;
    complaintsLast7d: number;
    bounceRate: number;
    complaintRate: number;
  };
  issues: HealthIssue[];
  action: "none" | "warn" | "pause" | "retire";
}

export interface HealthIssue {
  severity: "warning" | "critical";
  message: string;
  metric: string;
  value: number;
  threshold: number;
}

export interface WarmupSchedule {
  day: number;
  dailyTarget: number;
}

export interface MailboxSelection {
  mailboxId: string;
  domain: string;
  emailAddress: string;
  reason: string;
}
