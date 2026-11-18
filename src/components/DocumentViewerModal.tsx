import { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { getDocumentUrl } from '../services/api';
import type { DocumentItem } from '../types';
import { formatDateTime } from '../utils/format';

export function DocumentViewerModal({
  doc,
  onClose,
}: {
  doc: DocumentItem | null;
  onClose: () => void;
}) {
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTextPreview(null);
    setError(null);
    if (!doc) return;

    if (doc.mime_type?.startsWith('text/')) {
      fetch(getDocumentUrl(doc.id))
        .then((r) => {
          if (!r.ok) throw new Error('Unable to load document');
          return r.text();
        })
        .then(setTextPreview)
        .catch((err) => setError(err.message));
    }
  }, [doc]);

  if (!doc) return null;

  const url = getDocumentUrl(doc.id);
  const isImage = doc.mime_type?.startsWith('image/');
  const isPdf = doc.mime_type === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              {doc.file_name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {doc.document_type} · Uploaded {formatDateTime(doc.uploaded_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={url}
              download={doc.file_name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
              aria-label="Close document viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 flex-1 overflow-auto bg-slate-50 flex items-center justify-center min-h-[300px]">
          {error ? (
            <p className="text-sm text-rose-700">{error}</p>
          ) : isImage ? (
            <img
              src={url}
              alt={doc.file_name}
              className="max-h-[65vh] object-contain rounded border border-slate-200 bg-white"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={doc.file_name}
              className="w-full h-[65vh] rounded border border-slate-200 bg-white"
            />
          ) : textPreview !== null ? (
            <pre className="w-full p-4 bg-white border border-slate-200 rounded text-xs font-mono text-slate-800 whitespace-pre-wrap">
              {textPreview}
            </pre>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-700 font-medium">{doc.file_name}</p>
              <p className="text-xs text-slate-500 mt-1">
                Use the Download button above to inspect this protected file.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
