import { expect, test } from '@playwright/test'
import { launchApp, registerCamera, navigateTo, freshUserData } from './helpers.js'

test('camera registration survives an app restart', async () => {
  const userData = freshUserData()

  const first = await launchApp({ userData })
  await navigateTo(first.page, 'Câmeras')
  await registerCamera(first.page, { name: 'Persistente', host: '192.168.1.60' })
  await expect(first.page.getByText('Persistente', { exact: false })).toBeVisible()
  await first.close()

  const second = await launchApp({ userData })
  try {
    await navigateTo(second.page, 'Câmeras')
    await expect(second.page.getByText('Persistente', { exact: false })).toBeVisible()
  } finally {
    await second.close()
  }
})
