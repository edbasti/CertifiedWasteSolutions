import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (active) {
          setError("This browser cannot open the camera here. Use Gallery, or try on a phone over HTTPS.");
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (active) {
            setReady(true);
          }
        }
      } catch {
        if (active) {
          setError("Could not open the camera. Allow camera access, then try again—or use Gallery.");
        }
      }
    }

    void start();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video || !ready || video.videoWidth === 0) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not capture that photo. Try again.");
          return;
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        onCapture(new File([blob], `stop-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <Modal title="Camera" onClose={onClose}>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="camera-frame">
        <video ref={videoRef} className="camera-preview" playsInline muted autoPlay />
        {!ready && !error ? <p className="lede camera-waiting">Starting camera…</p> : null}
      </div>
      <div className="row-actions">
        <button className="primary" type="button" disabled={!ready || Boolean(error)} onClick={snap}>
          Take photo
        </button>
        <button className="secondary" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
