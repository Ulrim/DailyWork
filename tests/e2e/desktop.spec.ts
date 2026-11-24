import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// mobile.spec.ts 에서 최설비가 제출한 오늘 작업일보를 관리자가 처리하는 흐름
test.describe.configure({ mode: "serial" });

const ITEM = "보일러실 배관 스케치";
const acceptDialogs = (page: Page) => page.on("dialog", (d) => d.accept());

test("관리자: 검토함에서 승인하면 통합 작업일보·보고서·공정률에 반영된다", async ({ page }) => {
  await login(page, "manager@culiver.test");
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();

  // 승인 전: 통합 작업일보와 보고서에 나오지 않는다
  await page.goto("/consolidated");
  await expect(page.getByText(ITEM)).toHaveCount(0);
  await page.goto("/outputs?type=daily");
  await expect(page.getByText(ITEM)).toHaveCount(0);

  // 제출 현황
  await page.goto("/reviews");
  await expect(page.getByText("검토 대기").first()).toBeVisible();
  await page.getByRole("link").filter({ hasText: "최설비" }).filter({ hasText: ITEM }).click();
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+$/);

  // 보완 요청은 사유가 필요하다
  await page.getByRole("button", { name: "보완 요청" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "보완 요청" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("사유를 입력해 주세요");
  await page.getByRole("dialog").getByRole("button", { name: "취소" }).click();

  await page.getByRole("button", { name: "승인", exact: true }).click();
  await page.locator("#review-comment").fill("E2E 승인 의견");
  await page.getByRole("dialog").getByRole("button", { name: "승인" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("E2E 승인 의견")).toBeVisible();
  await expect(page.getByRole("button", { name: "승인", exact: true })).toHaveCount(0);

  // 승인 후: 통합 작업일보와 일간 보고서에 자동 취합된다
  await page.goto("/consolidated");
  await expect(page.getByText(ITEM).first()).toBeVisible();
  await expect(page.getByText("E2E 특이사항: 배관 자재 일부 미입고").first()).toBeVisible();
  await expect(page.getByText("E2E 익일 계획: 배관 지지대 설치").first()).toBeVisible();
  await page.goto("/outputs?type=daily");
  await expect(page.getByText(ITEM).first()).toBeVisible();
  await page.goto("/outputs?type=weekly");
  await expect(page.getByText(ITEM).first()).toBeVisible();
  await page.goto("/outputs?type=monthly");
  await expect(page.getByText(ITEM).first()).toBeVisible();

  // 공정 누계 실적률 5% 가 공정 관리에 반영된다
  await page.goto("/progress");
  await expect(page.getByRole("row").filter({ hasText: "냉난방·환경제어" }).getByText("5%").first()).toBeVisible();
});

test("승인 완료 후 수정: 작성자 수정 요청 → 관리자 허용 → 변경 이력 기록", async ({ browser }) => {
  const workerContext = await browser.newContext();
  const worker = await workerContext.newPage();
  acceptDialogs(worker);
  await login(worker, "worker3@culiver.test");
  await worker.goto("/reports/new");
  await expect(worker).toHaveURL(/\/reports\/[0-9a-f-]+$/);
  const reportUrl = worker.url();
  // 승인된 작업일보는 직접 수정할 수 없고 수정 요청만 가능하다
  await expect(worker.getByRole("link", { name: "수정" })).toHaveCount(0);
  await worker.getByRole("button", { name: "수정 요청" }).click();
  await worker.locator("#review-comment").fill("E2E 수량 오기재 정정");
  await worker.getByRole("dialog").getByRole("button", { name: "수정 요청" }).click();
  await expect(worker.getByText("수정 요청 처리 대기 중")).toBeVisible();

  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  await login(manager, "manager@culiver.test");
  await manager.goto("/reviews");
  await expect(manager.getByText("E2E 수량 오기재 정정")).toBeVisible();
  await manager.goto(reportUrl);
  await manager.getByRole("button", { name: "수정 허용" }).click();
  await manager.getByRole("dialog").getByRole("button", { name: "수정 허용" }).click();
  await expect(manager.getByText("보완 요청", { exact: true }).first()).toBeVisible();
  // 승인이 풀린 작업일보는 통합 작업일보에서 빠진다
  await manager.goto("/consolidated");
  await expect(manager.getByText(ITEM)).toHaveCount(0);

  // 작성자가 수정 후 재제출
  await worker.goto(reportUrl + "/edit");
  await worker.fill("#notes", "E2E 정정된 특이사항");
  await worker.getByRole("button", { name: "제출", exact: true }).click();
  await expect(worker).toHaveURL(reportUrl);
  await expect(worker.getByText("재제출")).toBeVisible();

  await manager.goto(reportUrl);
  await manager.getByRole("button", { name: "승인", exact: true }).click();
  await manager.getByRole("dialog").getByRole("button", { name: "승인" }).click();
  await expect(manager.getByRole("dialog")).toHaveCount(0);
  await manager.goto("/consolidated");
  await expect(manager.getByText("E2E 정정된 특이사항").first()).toBeVisible();

  // 변경 이력에 수정 전후 값이 남는다
  await manager.goto("/history");
  await expect(manager.getByText("E2E 정정된 특이사항").first()).toBeVisible();
  await expect(manager.getByText("E2E 특이사항: 배관 자재 일부 미입고").first()).toBeVisible();

  // 작성자에게 알림이 도착한다
  await worker.goto("/notifications");
  await expect(worker.getByText("수정 요청이 승인되었습니다").first()).toBeVisible();
  await expect(worker.getByText("작업일보가 승인되었습니다").first()).toBeVisible();
  await workerContext.close();
  await managerContext.close();
});

test("관리자: 업무 배정·수정·삭제와 일정 등록", async ({ page }) => {
  acceptDialogs(page);
  await login(page, "manager@culiver.test");
  await page.goto("/tasks?scope=all");
  await page.getByRole("button", { name: "업무 배정" }).click();
  await page.fill("#task-title", "E2E 배수로 점검");
  await page.locator("#task-assignee").selectOption({ label: await optionLabel(page, "#task-assignee", "최설비") });
  await page.fill("#task-start", "2026-01-10");
  await page.fill("#task-due", "2026-01-05");
  await page.getByRole("dialog").getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("기한은 시작일 이후여야 합니다");
  await page.fill("#task-due", "2026-01-20");
  await page.getByRole("dialog").getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.getByTestId("task-row").filter({ hasText: "E2E 배수로 점검" });
  await expect(row).toBeVisible();
  await expect(row.getByText("최설비")).toBeVisible();

  await row.getByRole("button", { name: "업무 수정" }).click();
  await page.fill("#task-title", "E2E 배수로 점검(수정)");
  await page.getByRole("dialog").getByRole("button", { name: "저장" }).click();
  await expect(page.getByTestId("task-row").filter({ hasText: "E2E 배수로 점검(수정)" })).toBeVisible();
  await page.getByTestId("task-row").filter({ hasText: "E2E 배수로 점검(수정)" }).getByRole("button", { name: "업무 삭제" }).click();
  await expect(page.getByTestId("task-row").filter({ hasText: "E2E 배수로 점검" })).toHaveCount(0);

  await page.goto("/calendar");
  await page.getByRole("button", { name: "일정 등록" }).click();
  await page.fill("#event-title", "E2E 안전 점검");
  await page.getByRole("dialog").getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("E2E 안전 점검").first()).toBeVisible();
});

async function optionLabel(page: Page, select: string, contains: string) {
  const labels = await page.locator(`${select} option`).allTextContents();
  const found = labels.find((l) => l.includes(contains));
  if (!found) throw new Error(`선택 항목 없음: ${contains}`);
  return found;
}

test("관리자: 계정 발급 → 로그인 → 사용 중지 → 로그인 거부", async ({ page, browser }) => {
  acceptDialogs(page);
  const email = `e2e-${Date.now()}@culiver.test`;
  await login(page, "manager@culiver.test");
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "계정 만들기" }).click();
  // 현장관리자는 현장팀·협력업체 계정만 만들 수 있다
  await expect(page.locator("#new-role option")).toHaveText(["현장팀", "협력업체"]);
  await page.fill("#new-name", "E2E신규");
  await page.fill("#new-email", email);
  await page.fill("#new-password", "short");
  await page.locator("#new-password").evaluate((el) => el.removeAttribute("minlength"));
  await page.getByRole("dialog").getByRole("button", { name: /만들기|등록|생성/ }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("8자 이상");
  await page.fill("#new-password", "E2e-Pass!2026");
  // 화면을 조작해 현장관리자 역할을 보내도 서버가 거부한다
  await page.locator("#new-role").evaluate((el: HTMLSelectElement) => {
    el.add(new Option("현장관리자", "site_manager"));
  });
  await page.locator("#new-role").selectOption("site_manager");
  await page.getByRole("dialog").getByRole("button", { name: /만들기|등록|생성/ }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("현장팀·협력업체 계정만");
  await page.locator("#new-role").selectOption("site_worker");
  await page.getByRole("dialog").getByRole("button", { name: /만들기|등록|생성/ }).click();
  await expect(page.getByTestId("user-list").getByText(email)).toBeVisible();

  // 새 계정으로 로그인
  const fresh = await browser.newContext();
  const user = await fresh.newPage();
  await login(user, email, "E2e-Pass!2026");
  await expect(user.getByText("E2E신규").first()).toBeVisible();
  await fresh.close();

  // 사용 중지 후 로그인 거부
  await page.getByRole("button", { name: "E2E신규 관리" }).click();
  await page.getByRole("button", { name: "사용 중지" }).click();
  await expect(page.getByText("사용이 중지된 계정입니다").first()).toBeVisible();
  const blocked = await browser.newContext();
  const denied = await blocked.newPage();
  await denied.goto("/login");
  await denied.fill("#email", email);
  await denied.fill("#password", "E2e-Pass!2026");
  await denied.getByRole("button", { name: "로그인" }).click();
  await expect(denied.locator("form [role=alert]")).toContainText("사용이 중지된 계정");
  await expect(denied).toHaveURL(/\/login/);
  await blocked.close();
});

test("협력업체: 배정 업무와 본인 작업일보만 보이고 내부 화면은 차단된다", async ({ page }) => {
  await login(page, "partner@culiver.test");
  for (const path of ["/progress", "/consolidated", "/outputs", "/reviews", "/history", "/admin/users"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/dashboard$/);
  }
  await page.goto("/tasks");
  await expect(page.getByTestId("task-row")).toHaveCount(1);
  await expect(page.getByTestId("task-row")).toContainText("가설 전기 및 분전반 설치");
  // 전체 보기 주소를 직접 입력해도 타인의 작업일보는 보이지 않는다
  await page.goto("/reports?scope=all");
  await expect(page.getByText("A동 기둥 세우기")).toHaveCount(0);
  await expect(page.getByText("가설 전기 배선")).toBeVisible();
  // 타인의 작업일보 주소를 직접 열어도 볼 수 없다
  await page.goto("/dashboard");
  await expect(page.getByText("전체 공정률")).toHaveCount(0);
});

test("대표이사: 전체 사업장 전환과 사업장 관리", async ({ page }) => {
  await login(page, "ceo@culiver.test");
  await expect(page.getByText("전체 공정률").first()).toBeVisible();
  const switcher = page.getByLabel("사업장 선택");
  await expect(switcher.locator("option")).toHaveCount(2);
  await page.goto("/admin/projects");
  await expect(page.getByText("GH-SF-01")).toBeVisible();
  await expect(page.getByText("GH-SF-02")).toBeVisible();
  await page.goto("/history");
  await expect(page.locator("main")).toContainText("작업일보");
});
