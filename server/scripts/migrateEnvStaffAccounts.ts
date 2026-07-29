import 'dotenv/config'
import { getStaffUsers } from '../routes/auth.js'
import { getSupabase } from '../lib/supabase.js'

async function migrateEnvironmentStaffAccounts(): Promise<void> {
  const bootstrapUsername = process.env.AUTH_SUPERADMIN_USERNAME ?? 'voanhduy1710'
  const users = getStaffUsers().filter((user) => user.username !== bootstrapUsername)
  if (!users.length) {
    console.log('No dynamic staff accounts found in the environment.')
    return
  }

  const supabase = getSupabase()
  for (const user of users) {
    const account = await supabase
      .from('staff_accounts')
      .upsert({
        username: user.username,
        full_name: user.username,
        password_hash: user.password_hash,
        status: 'active',
      } as never, { onConflict: 'username' })
      .select('id')
      .single()
    if (account.error || !account.data) throw account.error ?? new Error(`Could not migrate ${user.username}`)

    const role = await supabase.from('staff_account_roles').upsert({
      staff_account_id: (account.data as { id: string }).id,
      role: user.role,
    } as never)
    if (role.error) throw role.error
  }

  console.log(`Migrated ${users.length} staff account(s) to Supabase.`)
}

migrateEnvironmentStaffAccounts().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
