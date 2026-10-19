// String() prevents the minifier from folding placeholder comparisons at build time.
// This ensures entrypoint.sh can replace placeholders in the built files at runtime.
const ENV = String(process.env.NEXT_PUBLIC_ENVIRONMENT || '');

export const getApplicationEnvironment = () => (ENV === 'TEST' ? 'TEST' : null);
