import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "demo-artifacts");
const VIDEO_DIR = path.join(OUT_DIR, "video");
const PORT = process.env.DEMO_PORT || "3100";
const BASE_URL = process.env.DEMO_BASE_URL || `http://localhost:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}\n${stderr}`));
    });
  });
}

async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await sleep(1000);
  }
  throw new Error(`Server not ready at ${url}`);
}

async function clickIfVisible(page, selector, delay = 500) {
  const locator = page.locator(selector);
  if (await locator.isVisible().catch(() => false)) {
    await locator.first().click();
    await page.waitForTimeout(delay);
    return true;
  }
  return false;
}

async function waitAndClick(page, selector, timeout = 15000, delay = 900) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout });
  await locator.click();
  await page.waitForTimeout(delay);
}

async function typeIfVisible(page, selector, value) {
  const locator = page.locator(selector);
  if (await locator.isVisible().catch(() => false)) {
    await locator.first().fill(value);
    await page.waitForTimeout(300);
    return true;
  }
  return false;
}

async function disableTutorial(page) {
  const openGuide = page.locator('button:has-text("Open Guide")');
  const hideGuide = page.locator('button:has-text("Hide Guide")');
  if (await openGuide.isVisible().catch(() => false)) {
    await openGuide.click();
    await page.waitForTimeout(200);
  }

  await clickIfVisible(page, 'button:has-text("Disable All")', 300);

  if (await hideGuide.isVisible().catch(() => false)) {
    await hideGuide.click();
    await page.waitForTimeout(200);
  }
}

async function runDemo(page) {
  await page.addInitScript(() => {
    localStorage.setItem("agentrail:demo:bypass-wallet", "1");
    localStorage.setItem("agentrail:tutorial:disabled", "1");
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await disableTutorial(page);
  await page.waitForTimeout(1200);

  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(700);
  await page.mouse.wheel(0, -1000);
  await page.waitForTimeout(500);

  await waitAndClick(page, 'a:has-text("START_APP [INIT]")', 20000, 1400);
  await page.waitForURL(/\/buyer/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  await disableTutorial(page);
  await typeIfVisible(
    page,
    'textarea[placeholder="DESCRIBE_THE_SERVICE_NEEDED..."]',
    "Buy a signed company enrichment response and only settle after verifiable proof",
  );
  await waitAndClick(page, 'button:has-text("GENERATE_PROPOSAL_HASH")', 15000, 1800);
  await waitAndClick(page, 'button:has-text("REJECT_PROPOSAL")', 15000, 1000);
  await waitAndClick(page, 'button:has-text("GENERATE_PROPOSAL_HASH")', 15000, 1800);
  await waitAndClick(page, 'button:has-text("APPROVE_AND_FUND")', 15000, 2200);

  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1200);

  await waitAndClick(page, 'a:has-text("PROVIDER")', 15000, 1600);
  await disableTutorial(page);
  await waitAndClick(page, 'button:has-text("ACCEPT_AND_STAKE")', 15000, 2200);
  await waitAndClick(page, 'button:has-text("SUBMIT_PROOF_HASH")', 15000, 2200);

  await waitAndClick(page, 'a:has-text("OPERATOR")', 15000, 1600);
  await disableTutorial(page);
  await waitAndClick(page, 'button:has-text("VERIFY_AND_OPEN_REVIEW")', 15000, 2200);

  await waitAndClick(page, 'a:has-text("BUYER")', 15000, 1600);
  await disableTutorial(page);
  await waitAndClick(page, 'button:has-text("APPROVE_EARLY_SETTLEMENT")', 15000, 2200);

  await typeIfVisible(
    page,
    'textarea[placeholder="DESCRIBE_THE_SERVICE_NEEDED..."]',
    "Buy another signed response and use the challenge flow to demonstrate disputes",
  );
  await waitAndClick(page, 'button:has-text("GENERATE_PROPOSAL_HASH")', 15000, 1800);
  await waitAndClick(page, 'button:has-text("APPROVE_AND_FUND")', 15000, 2200);

  await waitAndClick(page, 'a:has-text("PROVIDER")', 15000, 1600);
  await waitAndClick(page, 'button:has-text("ACCEPT_AND_STAKE")', 15000, 2200);
  await waitAndClick(page, 'button:has-text("SUBMIT_PROOF_HASH")', 15000, 2200);

  await waitAndClick(page, 'a:has-text("OPERATOR")', 15000, 1600);
  await waitAndClick(page, 'button:has-text("VERIFY_AND_OPEN_REVIEW")', 15000, 2200);

  await waitAndClick(page, 'a:has-text("BUYER")', 15000, 1600);
  await waitAndClick(page, 'button:has-text("OPEN_DISPUTE")', 15000, 2200);

  await waitAndClick(page, 'a:has-text("ARBITER")', 15000, 1600);
  await disableTutorial(page);
  await waitAndClick(page, 'button:has-text("RESOLVE_PROVIDER_WINS")', 15000, 1800);

  await waitAndClick(page, 'a:has-text("BUYER")', 15000, 1200);
  await page.waitForTimeout(2200);
}

async function main() {
  await mkdir(VIDEO_DIR, { recursive: true });

  const serverEnv = {
    ...process.env,
    DATABASE_URL: "",
    NEON_DATABASE_URL: "",
    NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS: process.env.NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS || "0xDa2418dE6fA1f2C0d68FB4b4682D666A56215035",
    NEXT_PUBLIC_MOCK_USDC_ADDRESS: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS || "0xF59BAD2FaAd7f900Df4F7dAd809A76CBd90FbaDD",
    NEXT_PUBLIC_DEMO_BYPASS: "true",
    AGENTRAIL_OPERATOR_ADDRESS: process.env.AGENTRAIL_OPERATOR_ADDRESS || "0x549390539BE66EA6efb99A0bB74be87Aeac18372",
    AGENTRAIL_ARBITER_ADDRESS: process.env.AGENTRAIL_ARBITER_ADDRESS || "0x549390539BE66EA6efb99A0bB74be87Aeac18372",
    AGENTRAIL_OPERATOR_PRIVATE_KEY:
      process.env.AGENTRAIL_OPERATOR_PRIVATE_KEY ||
      process.env.DEPLOYER_PRIVATE_KEY ||
      "0x104b002979d11b54f5b4df4869067529dd4e9fb32dc3fbe1533a6178c6e02b2d",
    AGENTRAIL_AUTOSTART_CHALLENGE: "false",
    AGENTRAIL_AUTOSETTLE_ENABLED: "false",
    WALLET_AUTH_SECRET: process.env.WALLET_AUTH_SECRET || "agentrail-video-demo-secret",
  };

  await run("pnpm", ["build"], serverEnv);

  const server = spawn("pnpm", ["exec", "next", "start", "--port", PORT], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: serverEnv,
  });

  try {
    await waitForServer(BASE_URL, 180000);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1512, height: 982 },
      recordVideo: {
        dir: VIDEO_DIR,
        size: { width: 1512, height: 982 },
      },
    });

    const page = await context.newPage();
    await runDemo(page);

    const videoPath = await page.video().path();
    await context.close();
    await browser.close();

    console.log(`Demo video recorded at: ${videoPath}`);
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
