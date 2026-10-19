export const protectedRoutes = (process.env.NEXT_PUBLIC_PROTECTED_ROUTES || '').split(',').filter(Boolean);
