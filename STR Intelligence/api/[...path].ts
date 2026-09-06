import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApiRequest } from "../server/api/server.js";

// Keep provider-backed requests inside Vercel Hobby's five-minute ceiling.
export const maxDuration = 300;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await handleApiRequest(request, response);
}
