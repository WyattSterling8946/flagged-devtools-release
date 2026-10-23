import { z } from "zod";

export const releaseRequestSchema = z.object({
  buildId: z.string().min(1),
  releaseId: z.string().min(1),
  toolName: z.string().min(1),
  commitSha: z.string().regex(/^[0-9a-f]{7,40}$/i),
  buildStatus: z.enum(["passed", "failed"]),
});

export type ReleaseRequest = z.infer<typeof releaseRequestSchema>;

export type ReleaseDiagnostic = {
  buildEvent: {
    buildId: string;
    commitSha: string;
    status: ReleaseRequest["buildStatus"];
  };
  releaseOperation: {
    releaseId: string;
    toolName: string;
    decision: "approve" | "hold";
  };
  diagnostic: {
    code: "READY" | "BUILD_FAILED" | "FLAG_DISABLED";
    message: string;
  };
};

export function decideRelease(
  request: ReleaseRequest,
  flagEnabled: boolean,
): ReleaseDiagnostic {
  const base = {
    buildEvent: {
      buildId: request.buildId,
      commitSha: request.commitSha,
      status: request.buildStatus,
    },
  };

  if (request.buildStatus === "failed") {
    return {
      ...base,
      releaseOperation: {
        releaseId: request.releaseId,
        toolName: request.toolName,
        decision: "hold",
      },
      diagnostic: {
        code: "BUILD_FAILED",
        message: "The build must pass before this developer tool can be released.",
      },
    };
  }

  if (!flagEnabled) {
    return {
      ...base,
      releaseOperation: {
        releaseId: request.releaseId,
        toolName: request.toolName,
        decision: "hold",
      },
      diagnostic: {
        code: "FLAG_DISABLED",
        message: "The build passed; release remains held until the flag is enabled.",
      },
    };
  }

  return {
    ...base,
    releaseOperation: {
      releaseId: request.releaseId,
      toolName: request.toolName,
      decision: "approve",
    },
    diagnostic: {
      code: "READY",
      message: "The build passed and the developer-tools flag is enabled.",
    },
  };
}
