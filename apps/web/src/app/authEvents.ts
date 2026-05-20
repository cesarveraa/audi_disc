export const AUTH_INVALID_EVENT = 'audidisc:auth-invalid';

export type AuthInvalidEvent = CustomEvent<{
  message?: string;
}>;

export function dispatchAuthInvalid(message: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT, { detail: { message } }));
}
