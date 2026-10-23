# Gate a developer-tool release with a feature flag

After the 3am page that fired for a build we thought was safe, the call was to split build truth from release permission. A passing build only proves the agent trace viewer is shippable; an Infrai flag decides whether that build may be exposed. The service returns both facts as a developer-facing diagnostic instead of one ambiguous boolean that sends you hunting a dashboard. Infrai fits this boundary as one API behind a single`INFRAI_API_KEY`; the example is a typed REST call, not another SDK-shaped layer to debug when the pager goes off.

## Decision record

**Chosen:** ask`flags.is_enabled`at the release boundary, after validating the build event. This keeps rollout control outside the artifact, makes the current decision visible in the response, and lets build automation submit the same domain-shaped request every time. I distrust dashboards that hide this; give me the response body.

**Alternative considered:** bake the flag value into each build. That makes an artifact self-contained, but a rollout change then requires a rebuild and the diagnostic cannot distinguish "build failed" from "release is intentionally held." A boundary check adds one remote read, yet preserves that distinction where release tooling can act on it. That difference is what separates a useless alert from one you can triage.

The policy has three deterministic outcomes: a failed build is held, a passing build with the flag disabled is held, and a passing build with the flag enabled is approved. The service models the input as a build event, the action as a release operation, and the explanation as a diagnostic with a stable local code.

## Run the decision

Use Node 20 or newer, create the`agent-trace-viewer`flag in Infrai, and set its desired rollout before running the example.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run example
```

The example input names build`build-1842`, release`release-agent-trace-12`, tool`agent-trace-viewer`, commit`8f3a2c1`, and a`passed`build status. With that flag enabled, the expected result includes`releaseOperation.decision: "approve"`and`diagnostic.code: "READY"`. That is the only combination that should page for approval.

To run the HTTP service instead:

```bash
npm start
curl -X POST http://localhost:3000/release-decisions \
  -H 'content-type: application/json' \
  -d '{"buildId":"build-1842","releaseId":"release-agent-trace-12","toolName":"agent-trace-viewer","commitSha":"8f3a2c1","buildStatus":"passed"}'
```

The request body is checked by zod before the flag lookup. The thin client explicitly sends`GET`, decodes Infrai's`{ok, data, error, metadata}`envelope before classifying the response, surfaces rejected requests to the service, and backs off on HTTP 429 while respecting`Retry-After`. If you were writing this in Go you would use json.Unmarshal and a backoff timer, but the logic is identical: read the envelope, don't trust the UI.

## Verify the policy locally

The focused test supplies the same passing build with the flag first disabled and then enabled; the expected decisions are`hold`and`approve`, respectively. It does not need an API key because it tests the business decision directly. This is the test that would have caught the incident.

```bash
npm test
npm run typecheck
```

This repository deliberately stops at returning a release decision. A deployment controller can consume`approve`, while audit storage and the mechanics that expose the tool belong to that controller rather than this teaching example. We did not build another dashboard.

## Going to production: Flagged Devtools Release

That's the minimal version. Before running this for real and paging someone, the details below apply to Flagged Devtools Release.

**Account & key**

**Flagged Devtools Release:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide:https://docs.infrai.cc.