// Use the same route as the Worker so Pages cannot drift from the portal's
// request persistence, customer-session, confirmation-email, and retry logic.
import worker from '../../worker.js';

export function onRequestPost(context) {
  return worker.fetch(context.request, context.env, {
    waitUntil: promise => context.waitUntil(promise)
  });
}
export const onRequestGet = onRequestPost;
