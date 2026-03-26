import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("bridge service registry is shared across module instances", async () => {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "src", "web", "bridge-service.ts")).href;
  const alpha = await import(`${moduleUrl}?instance=alpha`);
  const beta = await import(`${moduleUrl}?instance=beta`);
  const projectCwd = resolve(process.cwd());

  await alpha.resetBridgeServiceForTests();

  try {
    const alphaService = alpha.getProjectBridgeServiceForCwd(projectCwd);
    const betaService = beta.getProjectBridgeServiceForCwd(projectCwd);

    assert.equal(alphaService, betaService);
    assert.equal(alpha.getProjectBridgeServiceForCwd(projectCwd), alphaService);
    assert.equal(beta.getProjectBridgeServiceForCwd(projectCwd), betaService);
  } finally {
    await alpha.resetBridgeServiceForTests();
  }
});
