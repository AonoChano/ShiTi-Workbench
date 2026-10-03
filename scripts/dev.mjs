import { spawn } from 'node:child_process';

// 同时启动 API 与 Vite（M1 开发模式）。Ctrl+C 一起退出。
const procs = [
  spawn('npm', ['run', 'dev', '-w', 'apps/server'], { shell: true, stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', 'apps/web'], { shell: true, stdio: 'inherit' }),
];
for (const p of procs) {
  p.on('exit', (code) => {
    for (const q of procs) q.kill();
    process.exit(code ?? 0);
  });
}
