import * as path from 'path';
import * as fs from 'fs';

// App root: from dist/config -> dist -> parent; from src/config -> src -> parent. Same uploads for serve + save.
const appRoot = path.join(__dirname, '..', '..');

export function getUploadsDir(): string {
  const dir = process.env.UPLOADS_PATH || path.join(appRoot, 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('📁 Created uploads directory:', dir);
  }
  return dir;
}
