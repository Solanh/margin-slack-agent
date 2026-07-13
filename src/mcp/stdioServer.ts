import { createInterface } from "node:readline";
import type { MarginMcpTools } from "./tools.js";
import { UnknownMcpToolError } from "./tools.js";

const LATEST_PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  LATEST_PROTOCOL_VERSION,
  "2025-06-18",
  "2025-03-26",
]);

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId | undefined;
  method: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export class MarginMcpStdioServer {
  private initialized = false;

  constructor(private readonly tools: MarginMcpTools) {}

  async run(): Promise<void> {
    const lines = createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
      terminal: false,
    });

    for await (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      await this.handleLine(line);
    }
  }

  async handleLine(line: string): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      this.writeError(null, {
        code: -32700,
        message: "Parse error",
      });
      return;
    }

    if (!isRecord(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string") {
      this.writeError(requestId(value), {
        code: -32600,
        message: "Invalid Request",
      });
      return;
    }

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: value.method,
      ...(isJsonRpcId(value.id) ? { id: value.id } : {}),
      ...(Object.prototype.hasOwnProperty.call(value, "params")
        ? { params: value.params }
        : {}),
    };

    if (request.id === undefined) {
      this.handleNotification(request);
      return;
    }

    try {
      const result = await this.handleRequest(request);
      this.writeResult(request.id, result);
    } catch (error) {
      if (error instanceof ProtocolError) {
        this.writeError(request.id, {
          code: error.code,
          message: error.message,
          ...(error.data === undefined ? {} : { data: error.data }),
        });
        return;
      }

      console.error("Margin MCP request failed", error);
      this.writeError(request.id, {
        code: -32603,
        message: "Internal error",
      });
    }
  }

  private async handleRequest(request: JsonRpcRequest): Promise<unknown> {
    if (request.method === "initialize") {
      const requestedVersion = initializeProtocolVersion(request.params);
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)
        ? requestedVersion
        : LATEST_PROTOCOL_VERSION;
      this.initialized = true;
      return {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: "margin-notes",
          title: "Margin Notes",
          version: "0.1.0",
          description:
            "Read-only access to one user's private Margin notes and meeting metadata.",
        },
        instructions:
          "All tools are read-only and already scoped to one configured Slack workspace/user. Use search_notes for date, topic, meeting, type, priority, and status questions. Use list_open_notes for outstanding work. The server performs no LLM calls; summarize the returned notes with the host model.",
      };
    }

    if (request.method === "ping") {
      return {};
    }

    if (!this.initialized) {
      throw new ProtocolError(-32002, "Server not initialized");
    }

    if (request.method === "tools/list") {
      return { tools: this.tools.list() };
    }

    if (request.method === "tools/call") {
      const params = callToolParams(request.params);
      try {
        return await this.tools.call(params.name, params.arguments);
      } catch (error) {
        if (error instanceof UnknownMcpToolError) {
          throw new ProtocolError(-32602, error.message);
        }
        throw error;
      }
    }

    throw new ProtocolError(-32601, `Method not found: ${request.method}`);
  }

  private handleNotification(request: JsonRpcRequest): void {
    if (request.method === "notifications/initialized") {
      this.initialized = true;
    }
    // Unknown notifications are intentionally ignored per JSON-RPC semantics.
  }

  private writeResult(id: JsonRpcId, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  private writeError(id: JsonRpcId, error: JsonRpcError): void {
    this.write({ jsonrpc: "2.0", id, error });
  }

  private write(message: unknown): void {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

class ProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

function initializeProtocolVersion(params: unknown): string {
  if (!isRecord(params) || typeof params.protocolVersion !== "string") {
    throw new ProtocolError(-32602, "initialize requires protocolVersion");
  }
  return params.protocolVersion;
}

function callToolParams(params: unknown): {
  name: string;
  arguments: unknown;
} {
  if (!isRecord(params) || typeof params.name !== "string") {
    throw new ProtocolError(-32602, "tools/call requires a tool name");
  }
  return {
    name: params.name,
    arguments: params.arguments ?? {},
  };
}

function requestId(value: unknown): JsonRpcId {
  if (!isRecord(value) || !isJsonRpcId(value.id)) {
    return null;
  }
  return value.id;
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
