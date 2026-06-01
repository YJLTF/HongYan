const { execFile } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  const rcedit = path.join(
    process.env.LOCALAPPDATA || '',
    'electron-builder', 'Cache', 'winCodeSign', 'winCodeSign-2.6.0', 'rcedit-x64.exe'
  );

  const appInfo = context.packager.appInfo;
  const args = [exePath];

  const fields = {
    FileDescription: appInfo.productName,
    ProductName: appInfo.productName,
    LegalCopyright: 'Copyright 2026 HongYan',
    InternalName: appInfo.productName,
    OriginalFilename: appInfo.productFilename + '.exe',
    CompanyName: appInfo.productName,
  };

  for (const [key, value] of Object.entries(fields)) {
    args.push('--set-version-string', key, String(value));
  }
  args.push('--set-file-version', appInfo.version);
  args.push('--set-product-version', appInfo.version + '.0');

  return new Promise((resolve) => {
    execFile(rcedit, args, (err) => {
      if (err) console.warn('rcedit skipped:', err.message);
      resolve();
    });
  });
};
