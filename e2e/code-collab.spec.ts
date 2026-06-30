import { expect, test } from "@playwright/test";

test("two users can share a room and open the AI workspace", async ({ browser }) => {
  const roomId = `e2e-${Date.now()}`;
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();

  try {
    await alice.goto(`/?room=${roomId}`);
    await bob.goto(`/?room=${roomId}`);

    await alice.getByLabel("Your name").fill("Alice");
    await bob.getByLabel("Your name").fill("Bob");
    await alice.getByRole("button", { name: "Join Room" }).click();
    await bob.getByRole("button", { name: "Join Room" }).click();

    await expect(alice.getByText("Alice")).toBeVisible();
    await expect(alice.getByText("Bob")).toBeVisible();
    await expect(bob.getByText("Alice")).toBeVisible();
    await expect(bob.getByText("Bob")).toBeVisible();

    await alice.getByLabel("Prompt").fill("Explain the current code.");
    await alice.getByRole("button", { name: "Run Ask" }).click();

    await expect(alice.getByText("AI is not configured yet. Add OPENAI_API_KEY", { exact: false })).toBeVisible();
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
