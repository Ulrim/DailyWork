import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, login, photo } from "./helpers";

// 현장팀(최설비)이 휴대폰으로 작업일보를 작성·제출하는 흐름
test.describe.configure({ mode: "serial" });

test("잘못된 비밀번호로는 로그인할 수 없다", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "worker3@culiver.test");
  await page.fill("#password", "wrong-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("이메일 또는 비밀번호가 올바르지 않습니다");
  await expect(page).toHaveURL(/\/login/);
});

test("로그인하지 않으면 모든 화면이 로그인으로 이동한다", async ({ page }) => {
  for (const path of ["/dashboard", "/reports", "/admin/users", "/outputs"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("모바일 화면: 하단 메뉴가 보이고 좌우로 넘치지 않는다", async ({ page }) => {
  await login(page, "worker3@culiver.test");
  await expect(page.getByRole("navigation", { name: "하단 메뉴" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeHidden();
  for (const path of ["/dashboard", "/reports", "/tasks", "/calendar", "/progress", "/consolidated", "/outputs?type=weekly", "/notifications", "/menu", "/admin/account"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("현장팀은 관리자 화면에 들어갈 수 없다", async ({ page }) => {
  await login(page, "worker3@culiver.test");
  for (const path of ["/reviews", "/admin/users", "/admin/projects", "/history"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/dashboard$/);
  }
  await page.goto("/menu");
  await expect(page.getByRole("link", { name: "계정 관리" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "검토함" })).toHaveCount(0);
});

test("작업일보 작성: 입력 검증 → 사진 → 임시저장 → 제출", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "worker3@culiver.test");
  await page.getByRole("link", { name: "오늘 작업일보 작성" }).last().click();
  await expect(page).toHaveURL(/\/reports\/new/);

  // 실제 작업시간 자동 계산
  await expect(page.getByTestId("work-minutes")).toHaveText("8시간");
  await page.fill("#end_time", "17:30");
  await page.fill("#break_minutes", "120");
  await expect(page.getByTestId("work-minutes")).toHaveText("7시간 30분");

  // 종료시간이 시작시간보다 빠르면 저장되지 않는다
  await page.fill("#end_time", "07:00");
  await expect(page.getByTestId("work-minutes")).toHaveText("시간을 확인해 주세요");
  await page.locator("textarea[id^=content-]").first().fill("보일러실 배관 스케치");
  await page.getByRole("button", { name: "임시저장" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "종료시간은 시작시간보다 늦어야 합니다" })).toBeVisible();
  await page.fill("#end_time", "17:30");

  // 실적률 범위 검증 (브라우저 제한을 우회해도 서버가 거부한다)
  const first = page.getByTestId("report-item").first();
  await first.locator("select[id^=process-]").selectOption({ label: "냉난방·환경제어" });
  await first.locator("input[id^=process-progress-]").evaluate((el) => el.removeAttribute("max"));
  await first.locator("input[id^=process-progress-]").fill("150");
  await page.getByRole("button", { name: "임시저장" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "100 이하여야 합니다" })).toBeVisible();
  await first.locator("input[id^=process-progress-]").fill("5");

  // 작업내역 2건
  await first.locator("textarea[id^=result-]").fill("배관 경로 2개소 확정");
  await page.getByRole("button", { name: "작업내역 추가" }).click();
  const second = page.getByTestId("report-item").nth(1);
  await second.locator("textarea[id^=content-]").fill("자재 창고 정리");
  await second.locator("input[id^=quantity-]").fill("12");
  await second.locator("input[id^=unit-]").fill("팔레트");
  await second.getByRole("radio", { name: "완료" }).click();

  await page.fill("#notes", "E2E 특이사항: 배관 자재 일부 미입고");
  await page.fill("#next_day_plan", "E2E 익일 계획: 배관 지지대 설치");

  // 사진 업로드 (아직 저장 전이므로 자동으로 임시저장된다)
  await page.getByTestId("album-input").setInputFiles({ name: "site.png", mimeType: "image/png", buffer: photo() });
  await expect(page.getByAltText("현장 사진")).toHaveCount(1, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+\/edit$/);
  const imageOk = await page.getByAltText("현장 사진").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(imageOk).toBe(true);
  // 2000px 사진이 1600px 이하로 축소되어 올라간다
  const width = await page.getByAltText("현장 사진").evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(width).toBeLessThanOrEqual(1600);

  await page.getByRole("button", { name: "임시저장" }).click();
  await expect(page.getByRole("status").filter({ hasText: "임시저장했습니다" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "제출", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+$/);
  await expect(page.getByText("제출", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("작업내역 2건")).toBeVisible();
  await expect(page.getByText("현장 사진 1장")).toBeVisible();
  await expect(page.getByText("7시간 30분")).toBeVisible();
});

test("중복 제출 방지: 같은 날 작업일보는 1건이고 제출 후에는 수정할 수 없다", async ({ page }) => {
  await login(page, "worker3@culiver.test");
  // 새로 작성하려 해도 기존 작업일보로 이동한다
  await page.goto("/reports/new");
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByRole("link", { name: "수정" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "제출", exact: true })).toHaveCount(0);
  // 수정 화면 주소로 직접 들어가도 상세로 돌아온다
  await page.goto(`/reports/${id}/edit`);
  await expect(page).toHaveURL(new RegExp(`/reports/${id}$`));
  // 목록에는 오늘 작업일보가 1건만 있다
  await page.goto("/reports");
  await expect(page.getByRole("link").filter({ hasText: "보일러실 배관 스케치" })).toHaveCount(1);
});

test("담당자가 본인 업무의 진행상태를 갱신한다", async ({ page }) => {
  await login(page, "worker3@culiver.test");
  await page.goto("/tasks");
  const row = page.getByTestId("task-row").filter({ hasText: "보일러실 장비 반입 계획 수립" });
  await row.getByRole("button", { name: "진행상태 변경" }).click();
  await page.getByRole("dialog").getByRole("radio", { name: "진행중" }).click();
  await page.locator("#my-progress").fill("35");
  await page.getByRole("dialog").getByRole("button", { name: "저장" }).click();
  await expect(row.getByText("35%")).toBeVisible();
  await expect(row.getByText("진행중")).toBeVisible();
  // 관리 기능(업무 배정·수정·삭제)은 보이지 않는다
  await expect(page.getByRole("button", { name: "업무 배정" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "업무 수정" })).toHaveCount(0);
});
