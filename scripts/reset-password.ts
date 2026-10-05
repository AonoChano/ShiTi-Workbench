/**
 * 重置用户密码：npm run reset-password -- <用户名或邮箱> <新密码>
 * 直接操作工作区数据库（与服务器共用 SHITI_DATA_DIR 定位），改完重启服务即可生效。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const envFile = join(repoRoot, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m?.[1] && !(m[1] in process.env)) process.env[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

const [, , account, newPassword] = process.argv;
if (!account || !newPassword) {
  console.error('用法：npm run reset-password -- <用户名或邮箱> <新密码>（至少 8 位，含字母和数字）');
  process.exit(1);
}
if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
  console.error('密码至少 8 位，需同时包含字母和数字。');
  process.exit(1);
}

const dataDir = process.env['SHITI_DATA_DIR']
  ?? join(process.env['LOCALAPPDATA'] ?? join('C:', 'Users', 'Public'), 'ShitiWorkbench', 'workspaces', 'default');
const db = new Database(join(dataDir, 'workspace.sqlite'));

const { scryptSync, randomBytes, timingSafeEqual } = await import('node:crypto');
const salt = randomBytes(16);
const N = 16384, r = 8, p = 1;
const key = scryptSync(newPassword, salt, 64, { N, r, p });
const hash = `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;

const row = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(account, account.toLowerCase()) as { id: string } | undefined;
if (!row) {
  console.error(`找不到账号 ${account}。`);
  process.exit(1);
}
db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, new Date().toISOString(), row.id);
db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(row.id); // 踢掉旧会话
console.log(`账号 ${account} 的密码已重置，旧会话已全部注销。`);
db.close();
