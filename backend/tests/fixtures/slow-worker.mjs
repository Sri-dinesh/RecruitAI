/* global setTimeout */
import { parentPort } from 'node:worker_threads';

// Minimal worker used by the Phase 21 pool tests.
parentPort?.on('message', (request) => {
  if (request.task === 'renderReport') {
    setTimeout(() => {
      parentPort.postMessage({
        id: request.id,
        ok: true,
        result: { echoed: request.payload },
      });
    }, 100);
    return;
  }
  if (request.task === 'parseDocument') {
    parentPort.postMessage({
      id: request.id,
      ok: false,
      error: { message: 'boom', name: 'Error' },
    });
  }
});
