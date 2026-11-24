import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { campaignsApi, emailsApi, sendersApi, slackApi, statsApi, type EmailQuery } from "../api/endpoints";

/** Dashboard data refreshes itself so sent/failed rows appear while the worker runs. */
const LIVE = 5_000;

export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: statsApi.get, refetchInterval: LIVE });
export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: statsApi.health, refetchInterval: 15_000 });
export const useCampaigns = () => useQuery({ queryKey: ["campaigns"], queryFn: campaignsApi.list, refetchInterval: LIVE });
export const useSenders = () => useQuery({ queryKey: ["senders"], queryFn: sendersApi.list, refetchInterval: 15_000 });
export const useSlackStatus = () => useQuery({ queryKey: ["slack"], queryFn: slackApi.status });

export const useEmails = (query: EmailQuery) =>
  useQuery({
    queryKey: ["emails", query],
    queryFn: () => emailsApi.list(query),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE
  });
