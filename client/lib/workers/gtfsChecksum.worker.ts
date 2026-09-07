/**
 * SHA-256s a GTFS archive off the main thread.
 *
 * The digest is computed before the upload starts so the server can verify the
 * stored bytes against what the browser read. On a multi-hundred-megabyte feed
 * doing this inline would freeze the page for seconds; here the page shows a
 * real percentage while it runs.
 */

import { hashBlob, type ChecksumWorkerMessage } from "../gtfs/hashBlob";

const post = (msg: ChecksumWorkerMessage) =>
  (self as unknown as { postMessage(m: unknown): void }).postMessage(msg);

self.onmessage = (event: MessageEvent<{ file: Blob }>) => {
  const { file } = event.data;
  void hashBlob(file, {
    onProgress: ({ loaded, total }) => post({ type: "progress", loaded, total }),
  })
    .then((checksum) => post({ type: "result", checksum }))
    .catch((err: unknown) =>
      post({
        type: "error",
        message: err instanceof Error ? err.message : "Checksum failed",
      })
    );
};
