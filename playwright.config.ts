import { defineConfig, devices } from "@playwright/test";

// E2E 테스트는 테스트 데이터(seed:dev)가 들어 있는 개발/검수 환경에서만 실행한다.
// 실행 전: npm run stack:reset && npm run seed:dev  (docs/TESTING.md 참고)
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /mobile\.spec\.ts/ },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } }, testMatch: /desktop\.spec\.ts/, dependencies: ["mobile"] },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
