const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findRcedit(cacheRoot) {
  if (!fs.existsSync(cacheRoot)) {
    return null;
  }

  const stack = [cacheRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name === 'rcedit-x64.exe') {
        return fullPath;
      }
    }
  }

  return null;
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico');
  const cacheRoot = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
  const rceditPath = findRcedit(cacheRoot);

  if (!rceditPath) {
    throw new Error(`Could not find rcedit-x64.exe in ${cacheRoot}`);
  }

  execFileSync(rceditPath, [exePath, '--set-icon', iconPath], { stdio: 'inherit' });
};
