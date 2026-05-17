const { execSync } = require('child_process');
try {
  // Clear the DATABASE_URL so Prisma doesn't try to connect to the local proxy
  const env = { ...process.env };
  delete env.DATABASE_URL;
  
  const stdout = execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script', {
    env,
    encoding: 'utf-8'
  });
  console.log("SUCCESS:");
  require('fs').writeFileSync('supabase_schema.sql', stdout);
  console.log("Wrote to supabase_schema.sql");
} catch (e) {
  console.error("ERROR:", e.message);
  console.error("STDERR:", e.stderr);
}
