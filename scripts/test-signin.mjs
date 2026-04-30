import { chromium } from "playwright";

const BASE = "http://localhost:3002";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // 1. Go to sign-in
  console.log("1. Opening sign-in page...");
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "pw-01-signin-page.png" });
  console.log("   Screenshot: pw-01-signin-page.png");

  // 2. Check all buttons
  const buttons = await page.$$eval("button", (els) =>
    els.map((el) => ({
      text: el.textContent.trim(),
      visible: el.offsetParent !== null,
      disabled: el.disabled,
      type: el.type,
      rect: el.getBoundingClientRect(),
    }))
  );
  console.log("2. Buttons found:", JSON.stringify(buttons, null, 2));

  // 3. Check Google button specifically
  const googleBtn = page.locator('button:has-text("Google")');
  const googleCount = await googleBtn.count();
  console.log(`3. Google buttons: ${googleCount}`);
  if (googleCount > 0) {
    const box = await googleBtn.first().boundingBox();
    console.log("   Google button box:", box);
    const isVisible = await googleBtn.first().isVisible();
    console.log("   Google button visible:", isVisible);
  }

  // 4. Check Microsoft button
  const msBtn = page.locator('button:has-text("Microsoft")');
  const msCount = await msBtn.count();
  console.log(`4. Microsoft buttons: ${msCount}`);

  // 5. Try credentials login
  console.log("5. Trying credentials login with contact@elevay.app...");
  await page.fill('input[name="email"]', "contact@elevay.app");
  await page.fill('input[name="password"]', "Elevay2026!");
  await page.screenshot({ path: "pw-02-filled-form.png" });

  // 6. Click Sign in
  console.log("6. Clicking Sign in...");
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "pw-03-after-signin.png" });
  console.log("   Current URL:", page.url());
  console.log("   Screenshot: pw-03-after-signin.png");

  // 7. If still on sign-in, try Google
  if (page.url().includes("sign-in")) {
    console.log("7. Credentials failed, trying Google OAuth...");
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });

    // Click Google and watch what happens
    const [response] = await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => null),
      googleBtn.first().click(),
    ]);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "pw-04-after-google.png" });
    console.log("   URL after Google click:", page.url());
    console.log("   Screenshot: pw-04-after-google.png");
  }

  // 8. Final state
  await page.screenshot({ path: "pw-05-final.png" });
  console.log("8. Final URL:", page.url());

  await browser.close();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
