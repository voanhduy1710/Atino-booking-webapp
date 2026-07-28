import { expect, test } from '@playwright/test'

test('landing and login do not overflow on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  await expect(page).toHaveTitle(/Atino Booking/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await page.goto('/login')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const controls = page.locator('button')
  for (let index = 0; index < await controls.count(); index += 1) {
    const box = await controls.nth(index).boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
})

test('protected routes redirect anonymous users to login', async ({ page }) => {
  await page.goto('/reviewbooking')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Tên đăng nhập')).toBeVisible()
})
