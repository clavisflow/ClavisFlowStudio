export const AUTH_RETURN_TO_KEY = "clavisflow.auth-return-to";
export const AUTH_POPUP_CHANNEL = "clavisflow.auth-popup";
export const AUTH_POPUP_COMPLETE = "clavisflow.auth-complete";
export const AUTH_POPUP_ERROR = "clavisflow.auth-error";
export const AUTH_POPUP_NAME = "clavisflow-google-login";

export type AuthPopupMessage =
  | { type: typeof AUTH_POPUP_COMPLETE }
  | { type: typeof AUTH_POPUP_ERROR; message: string };

export function isAuthPopupMessage(value: unknown): value is AuthPopupMessage {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const type = (value as { type?: unknown }).type;
  return type === AUTH_POPUP_COMPLETE || type === AUTH_POPUP_ERROR;
}
