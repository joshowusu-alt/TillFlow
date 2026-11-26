// Only surface known, user-facing messages. Query parameters and unexpected
// exceptions can contain technical details and must not be echoed blindly.
const messages: Record<string, string> = {
  missing: 'Please fill in all required fields.',
  duplicate: 'A user with that email already exists.',
  password_short: 'Password must be at least 6 characters.',
  'Name, email, and password are required.': 'Name, email, and password are required.',
  'User ID, name, and email are required.': 'User ID, name, and email are required.',
  'A user with that email already exists.': 'A user with that email already exists.',
  'Email already in use.': 'Email already in use.',
  'Password must be at least 6 characters.': 'Password must be at least 6 characters.',
  'PIN must be 4 to 8 digits.': 'PIN must be 4 to 8 digits.',
  'User not found. They may have been removed.': 'User not found. They may have been removed.',
  'User not found.': 'User not found.',
  'You cannot deactivate your own account.': 'You cannot deactivate your own account.',
  'Choose whether to activate or deactivate this user.': 'Choose whether to activate or deactivate this user.',
  'User ID and new password are required.': 'User ID and new password are required.',
  "Only an owner can reset another owner's password.": "Only an owner can reset another owner's password.",
  'This business is now read-only because the payment grace window has ended. Record payment in Billing & Plans to restore write access.': 'This business is now read-only because the payment grace window has ended. Record payment in Billing & Plans to restore write access.',
};

export function userFormErrorMessage(error: string): string {
  return Object.prototype.hasOwnProperty.call(messages, error) ? messages[error] : 'Unable to save this user. Please try again or contact support.';
}
