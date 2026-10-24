// `npm run seed` entry point. Applies supabase/seed.sql against the data store.
// Implemented alongside Task 2.3. Stub for now so the script target resolves.

async function main(): Promise<void> {
  throw new Error('not_implemented: seed runner (Task 2.3)');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
