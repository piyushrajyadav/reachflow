import axios, { AxiosError } from "axios";

const API_URL: string = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/** Origin of the API server (for browser redirects such as Google/Slack OAuth and Bull Board). */
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export const http = axios.create({ baseURL: API_URL, withCredentials: true, timeout: 20_000 });

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
    if (error.code === "ERR_NETWORK") return "Cannot reach the server. Is the API running?";
    if (error.code === "ECONNABORTED") return "The request timed out.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export const isUnauthorized = (error: unknown) => error instanceof AxiosError && error.response?.status === 401;
