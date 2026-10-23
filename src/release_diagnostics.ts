import { createServer, type ServerResponse } from "node:http";
import { createInfraiFlagReader, InfraiError } from "./infrai_flags.js";
import { decideRelease, releaseRequestSchema } from "./release_policy.js";

const flagKey = "agent-trace-viewer";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request: NodeJS.ReadableStream): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > 32_768) reject(new Error("Request body is too large"));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

async function runExample(): Promise<void> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");

  const request = releaseRequestSchema.parse({
    buildId: "build-1842",
    releaseId: "release-agent-trace-12",
    toolName: "agent-trace-viewer",
    commitSha: "8f3a2c1",
    buildStatus: "passed",
  });
  const enabled = await createInfraiFlagReader(apiKey).isEnabled(flagKey);
  console.log(JSON.stringify(decideRelease(request, enabled), null, 2));
}

function startService(): void {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  const flags = createInfraiFlagReader(apiKey);

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/release-decisions") {
      sendJson(response, 404, { message: "Route not found" });
      return;
    }

    try {
      const parsed = releaseRequestSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        sendJson(response, 400, {
          message: "Invalid release request",
          issues: parsed.error.issues,
        });
        return;
      }

      const enabled = await flags.isEnabled(flagKey);
      sendJson(response, 200, decideRelease(parsed.data, enabled));
    } catch (error) {
      if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        sendJson(response, status, { message: error.message, detail: error.detail });
        return;
      }
      sendJson(response, 500, {
        message: error instanceof Error ? error.message : "Unexpected service error",
      });
    }
  });

  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Release diagnostics listening on ${port}`));
}

if (process.argv.includes("--example")) {
  await runExample();
} else {
  startService();
}
