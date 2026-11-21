import { useEffect, useState } from 'react';
import type { PostcardSpec } from './spec';

/**
 * "Make a postcard": draws the image in the browser, shows it, and offers Save and (where the device
 * supports sharing files) Share. Nothing is uploaded.
 */
export default function PostcardButton({ spec, fileName }: { spec: PostcardSpec; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const make = () => {
    setError(null);
    // The drawing code loads only when someone asks for a postcard.
    import('./draw')
      .then(({ drawPostcard }) => drawPostcard(spec))
      .then(
      (blob) => {
        setFile(new File([blob], fileName, { type: 'image/png' }));
        setUrl(URL.createObjectURL(blob));
      },
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not make the postcard.'),
    );
  };
  const canShare = file !== null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  return (
    <div className="space-y-2">
      {!url && (
        <button type="button" className="btn btn-fun" onClick={make}>
          Make a postcard
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-sev-warning">
          {error}
        </p>
      )}
      {url && (
        <div className="space-y-2">
          <img src={url} alt={`Postcard: ${spec.title}. ${spec.lines.join(' ')}`} className="w-full max-w-xl rounded-xl border-2 border-ink" />
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-primary" href={url} download={fileName}>
              Save image
            </a>
            {canShare && (
              <button type="button" className="btn btn-secondary" onClick={() => void navigator.share({ files: [file], title: spec.title }).catch(() => undefined)}>
                Share
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
