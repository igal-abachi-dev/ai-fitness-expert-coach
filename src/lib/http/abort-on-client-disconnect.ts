import type { FastifyReply } from 'fastify';

/**
 * Returns an AbortSignal that fires when the client disconnects before the
 * response has finished. Pass it to `agent.generate` / `agent.stream` so an
 * abandoned request stops billing you for tokens mid-loop.
 *
 * `close` on the raw response fires in both cases; `writableEnded` tells
 * them apart (true = we finished normally, false = client went away).
 */
export function abortOnClientDisconnect(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.once('close', () => {
    if (!reply.raw.writableEnded) {
      controller.abort(new Error('Client disconnected'));
    }
  });
  return controller.signal;
}
