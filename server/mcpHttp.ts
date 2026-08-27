import type { RequestHandler } from "express";
import { handleSlackMcp } from "./mcpServer";

// Kept as a dedicated boundary module so the server bootstrap remains stable while
// the standards-compliant MCP transport evolves independently.
export const mcpHttpHandler: RequestHandler = handleSlackMcp;
