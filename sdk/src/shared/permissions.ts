let pendingRequests: Promise<unknown> = Promise.resolve();

// Needed because Android cannot be bothered to display one permission after another
// and instead it just completely ignores the second of to simultaneous requests.
export function queuePermissionRequest<T>(request: () => Promise<T>): Promise<T> {
  const firstOthersThenThis = pendingRequests.then(request);
  pendingRequests = firstOthersThenThis;
  return firstOthersThenThis;
}
