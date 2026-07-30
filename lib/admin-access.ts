export const ADMIN_EMAIL = "clavisflow@gmail.com";

export function isAdminEmail(email?: string | null) {
  return email?.trim().toLocaleLowerCase("en-US") === ADMIN_EMAIL;
}
