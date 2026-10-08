"use client";

import { useEffect, useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUploadPages } from "../lib/useUploadPages";

/**
 * Full-screen camera for photographing many pages back to back. Each shot is uploaded in the
 * background, one at a time so page numbers follow capture order, while the next one is taken.
 * With `slots`, it asks for those random pages in order and stops after the last one.
 */
export function PageScanner(props: { bookId: Id<"books">; slots?: number[]; onClose: () => void }) {
  const { bookId, onClose } = props;
  // The slots at opening: they close one by one as shots upload, but the order to ask for them is fixed
  const [slots] = useState(props.slots);
  const uploadPages = useUploadPages(bookId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [captured, setCaptured] = useState(0);
  const [uploaded, setUploaded] = useState(0);
  const [lastShotUrl, setLastShotUrl] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let closed = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 4096 } },
        audio: false,
      })
      .then(
        (s) => {
          stream = s;
          if (closed) s.getTracks().forEach((t) => t.stop());
          else videoRef.current!.srcObject = s;
        },
        // Permission denied or no camera: tell the user and offer the file picker instead
        (err: Error) => setCameraError(err.message)
      );
    return () => {
      closed = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => () => void (lastShotUrl && URL.revokeObjectURL(lastShotUrl)), [lastShotUrl]);

  const capture = () => {
    const video = videoRef.current!;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const slot = slots?.[captured];
    setCaptured((n) => n + 1);
    setFlashKey((k) => k + 1);
    canvas.toBlob(
      (blob) => {
        setLastShotUrl(URL.createObjectURL(blob!));
        uploadQueue.current = uploadQueue.current
          .then(async () => {
            const failures = await uploadPages([blob!], undefined, slot === undefined ? undefined : [slot]);
            if (failures.length) throw new Error(failures[0].message);
            setUploaded((n) => n + 1);
          })
          // Keep the queue going for later shots, but show that this one failed
          .catch((err: Error) => setUploadError(err.message));
      },
      "image/jpeg",
      0.92
    );
  };

  const pending = captured - uploaded;
  const slotsDone = slots !== undefined && captured >= slots.length;
  const uploadStatus = pending > 0 ? `uploading ${pending}` : "all uploaded";
  const progress = `${captured} ${captured === 1 ? "page" : "pages"} · ${uploadStatus}`;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-label="Scan pages">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onPlaying={() => setCameraReady(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Shutter flash; keyed so every capture replays the animation */}
        {flashKey > 0 && <div key={flashKey} className="absolute inset-0 bg-white pointer-events-none animate-flash" />}
        <div className="absolute top-0 inset-x-0 pt-[max(env(safe-area-inset-top),1rem)] px-4 flex justify-center">
          <div className="bg-black/60 text-white text-sm font-medium px-3 py-1.5 rounded-full" aria-live="polite">
            {uploadError
              ? `Upload failed: ${uploadError}`
              : slots
              ? slotsDone
                ? `All ${slots.length} random pages taken · ${uploadStatus}`
                : `Photograph page ${slots[captured]}${captured > 0 ? ` · ${progress}` : ""}`
              : captured === 0
              ? "Fit one page in the frame"
              : progress}
          </div>
        </div>
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="bg-white rounded-xl p-5 text-center max-w-xs">
              <p className="font-medium text-stone-900">Camera unavailable</p>
              <p className="text-sm text-stone-500 mt-1">{cameraError}</p>
              <p className="text-sm text-stone-500 mt-2">Close this and use Choose Photos instead.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] bg-black">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/10 relative">
          {lastShotUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lastShotUrl} alt="Last captured page" className="w-full h-full object-cover" />
          )}
        </div>
        <button
          onClick={capture}
          disabled={!cameraReady || slotsDone}
          aria-label="Capture page"
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
        >
          <span className="w-16 h-16 rounded-full bg-white" />
        </button>
        <button onClick={onClose} className="w-16 text-white font-semibold text-lg">
          Done
        </button>
      </div>
    </div>
  );
}
