const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'src');

const modules = [
  'auth', 'cart', 'categories', 'cloudinary', 'courses',
  'enrollments', 'lessons', 'orders', 'quizzes', 'sections', 'users'
];

modules.forEach(mod => {
  const interfacesDir = path.join(baseDir, mod, 'interfaces');
  const dtoDir = path.join(baseDir, mod, 'dto');
  const serializersDir = path.join(baseDir, mod, 'serializers');
  
  if (!fs.existsSync(interfacesDir)) fs.mkdirSync(interfacesDir, { recursive: true });
  if (!fs.existsSync(dtoDir)) fs.mkdirSync(dtoDir, { recursive: true });
  if (!fs.existsSync(serializersDir)) fs.mkdirSync(serializersDir, { recursive: true });
  
  // Write index.ts for interfaces
  fs.writeFileSync(path.join(interfacesDir, 'index.ts'), `// Export ${mod} interfaces here\n`);
  
  // Write index.ts for dto
  if (!fs.existsSync(path.join(dtoDir, 'index.ts'))) {
    fs.writeFileSync(path.join(dtoDir, 'index.ts'), `// Export ${mod} DTOs here\n`);
  }
});

console.log('Directories and index files created successfully.');
