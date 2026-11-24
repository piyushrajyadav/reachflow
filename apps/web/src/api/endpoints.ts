import { http, API_ORIGIN } from "./client";
import type {
  Campaign, CreateCampaignPayload, CreateCampaignResult, EmailRow, EmailStatus, Health, Paginated,
  Sender, SlackStatus, Stats, User
} from "../types/api";

const data = <T>(r: { data: { data: T } }) => r.data.data;

export const authApi = {
  loginUrl: `${API_ORIGIN}/api/auth/google`,
  me: () => http.get("/auth/me").then(data<User>),
  logout: () => http.post("/auth/logout")
};

export interface EmailQuery {
  view: "scheduled" | "sent";
  q?: string;
  status?: EmailStatus[];
  page: number;
  pageSize: number;
}

export const emailsApi = {
  list: ({ status, ...rest }: EmailQuery) =>
    http
      .get("/emails", { params: { ...rest, q: rest.q || undefined, status: status?.join(",") || undefined } })
      .then((r) => r.data as Paginated<EmailRow>)
};

export const campaignsApi = {
  list: () => http.get("/campaigns").then(data<Campaign[]>),
  create: (payload: CreateCampaignPayload, idempotencyKey: string) =>
    http.post("/campaigns", payload, { headers: { "Idempotency-Key": idempotencyKey } }).then(data<CreateCampaignResult>),
  cancel: (id: string) => http.post(`/campaigns/${id}/cancel`).then(data<{ cancelled: number }>)
};

export const sendersApi = {
  list: () => http.get("/senders").then(data<Sender[]>),
  addEthereal: () => http.post("/senders/ethereal", {}).then(data<Sender>),
  addSmtp: (payload: {
    email: string; displayName?: string; smtpHost: string; smtpPort: number; smtpUser: string; smtpPassword: string;
  }) => http.post("/senders", payload).then(data<Sender>),
  setActive: (id: string, isActive: boolean) => http.patch(`/senders/${id}`, { isActive })
};

export const statsApi = {
  get: () => http.get("/stats").then(data<Stats>),
  health: () => http.get("/stats/health").then(data<Health>)
};

export const slackApi = {
  connectUrl: `${API_ORIGIN}/api/slack/connect`,
  status: () => http.get("/slack/status").then(data<SlackStatus>),
  disconnect: () => http.post("/slack/disconnect"),
  test: () => http.post("/slack/test"),
  setChannel: (channelId: string | null) => http.put("/slack/channel", { channelId })
};

export const queueDashboardUrl = `${API_ORIGIN}/admin/queues`;
