export type EmailStatus =
  | "SCHEDULED" | "QUEUED" | "PROCESSING" | "RETRYING" | "RATE_LIMITED" | "SENT" | "FAILED" | "CANCELLED";

export type CampaignStatus =
  | "DRAFT" | "SCHEDULED" | "PROCESSING" | "COMPLETED" | "PARTIALLY_FAILED" | "FAILED" | "CANCELLED";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface EmailRow {
  id: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  attemptCount: number;
  previewUrl: string | null;
  campaignId: string;
  campaign: { name: string };
  sender: { email: string };
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  source: "elasticsearch" | "postgres";
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  startAt: string;
  delayMs: number;
  hourlyLimit: number;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

export interface Sender {
  id: string;
  email: string;
  displayName: string | null;
  smtpHost: string;
  smtpPort: number;
  isActive: boolean;
  createdAt: string;
  sentThisHour: number;
  hourlyLimit: number;
}

export interface Stats {
  total: number;
  scheduled: number;
  rateLimited: number;
  sent: number;
  failed: number;
  activeCampaigns: number;
  queue: Record<string, number>;
  limits: { workerConcurrency: number; minDelayMs: number; perSenderPerHour: number; globalPerHour: number };
}

export interface Health {
  database: boolean;
  redis: boolean;
  elasticsearch: boolean;
  workers: number;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  teamName: string | null;
  channelId: string | null;
  channelName: string | null;
  deliversTo: "channel" | "dm" | null;
}

export interface CreateCampaignPayload {
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayMs: number;
  hourlyLimit: number;
}

export interface CreateCampaignResult {
  id: string;
  status: CampaignStatus;
  totalEmails: number;
  startAt: string;
  duplicateRequest: boolean;
  skipped: { invalid: number; duplicates: number };
}
