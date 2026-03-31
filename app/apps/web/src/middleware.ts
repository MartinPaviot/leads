export { auth as middleware } from "./auth";

export const config = {
  matcher: [
    "/((?!api/auth|sign-in|sign-up|_next/static|_next/image|favicon.ico).*)",
  ],
};
