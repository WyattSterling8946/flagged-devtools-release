import assert from "node:assert/strict";
import test from "node:test";
import { decideRelease } from "../src/release_policy.js";

const passingBuild = {
  buildId: "build-1842",
  releaseId: "release-agent-trace-12",
  toolName: "agent-trace-viewer",
  commitSha: "8f3a2c1",
  buildStatus: "passed" as const,
};

test("a passing build is held while the developer-tools flag is disabled", () => {
  const result = decideRelease(passingBuild, false);

  assert.equal(result.releaseOperation.decision, "hold");
  assert.equal(result.diagnostic.code, "FLAG_DISABLED");
});

test("a passing build is approved when the developer-tools flag is enabled", () => {
  const result = decideRelease(passingBuild, true);

  assert.equal(result.releaseOperation.decision, "approve");
  assert.equal(result.diagnostic.code, "READY");
});
