import { useState, useEffect, useRef, useCallback } from 'react';

const CANVAS_SIZE = 300;
const OUTPUT_SIZE = 400;

function blobFromCanvas(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export default function ImageCropModal({ file, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [cropState, setCropState] = useState({ zoom: 1, offset: { x: 0, y: 0 }, minZoom: 1 });
  const [confirming, setConfirming] = useState(false);

  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pinchDist = useRef(null);

  const clampOffset = useCallback((ox, oy, z, imgW, imgH) => ({
    x: Math.min(0, Math.max(CANVAS_SIZE - imgW * z, ox)),
    y: Math.min(0, Math.max(CANVAS_SIZE - imgH * z, oy)),
  }), []);

  // Load image from file
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      imgRef.current = img;
      const fitZoom = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight);
      setCropState({
        zoom: fitZoom,
        minZoom: fitZoom,
        offset: {
          x: (CANVAS_SIZE - img.naturalWidth * fitZoom) / 2,
          y: (CANVAS_SIZE - img.naturalHeight * fitZoom) / 2,
        },
      });
    };
    img.src = url;
  }, [file]);

  // Draw on every cropState change
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      img,
      cropState.offset.x,
      cropState.offset.y,
      img.naturalWidth * cropState.zoom,
      img.naturalHeight * cropState.zoom,
    );
    ctx.restore();
  }, [cropState]);

  // Wheel — attach imperatively so we can pass passive: false
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e) => {
      e.preventDefault();
      const img = imgRef.current;
      if (!img) return;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setCropState(prev => {
        const clamped = Math.max(prev.minZoom, Math.min(prev.minZoom * 4, prev.zoom * factor));
        const imgCX = (CANVAS_SIZE / 2 - prev.offset.x) / prev.zoom;
        const imgCY = (CANVAS_SIZE / 2 - prev.offset.y) / prev.zoom;
        return {
          ...prev,
          zoom: clamped,
          offset: clampOffset(
            CANVAS_SIZE / 2 - imgCX * clamped,
            CANVAS_SIZE / 2 - imgCY * clamped,
            clamped, img.naturalWidth, img.naturalHeight,
          ),
        };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [clampOffset]);

  const applyZoom = useCallback((newZoom) => {
    const img = imgRef.current;
    if (!img) return;
    setCropState(prev => {
      const clamped = Math.max(prev.minZoom, Math.min(prev.minZoom * 4, newZoom));
      const imgCX = (CANVAS_SIZE / 2 - prev.offset.x) / prev.zoom;
      const imgCY = (CANVAS_SIZE / 2 - prev.offset.y) / prev.zoom;
      return {
        ...prev,
        zoom: clamped,
        offset: clampOffset(
          CANVAS_SIZE / 2 - imgCX * clamped,
          CANVAS_SIZE / 2 - imgCY * clamped,
          clamped, img.naturalWidth, img.naturalHeight,
        ),
      };
    });
  }, [clampOffset]);

  // Mouse drag
  const onMouseDown = (e) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const img = imgRef.current;
    if (!img) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setCropState(prev => ({
      ...prev,
      offset: clampOffset(prev.offset.x + dx, prev.offset.y + dy, prev.zoom, img.naturalWidth, img.naturalHeight),
    }));
  }, [clampOffset]);

  const onMouseUp = () => { dragging.current = false; };

  // Touch
  const getDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      dragging.current = true;
      pinchDist.current = null;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      dragging.current = false;
      pinchDist.current = getDistance(e.touches);
      lastPos.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  };

  const onTouchMove = useCallback((e) => {
    const img = imgRef.current;
    if (!img) return;
    if (e.touches.length === 1 && dragging.current) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setCropState(prev => ({
        ...prev,
        offset: clampOffset(prev.offset.x + dx, prev.offset.y + dy, prev.zoom, img.naturalWidth, img.naturalHeight),
      }));
    } else if (e.touches.length === 2 && pinchDist.current !== null) {
      const newDist = getDistance(e.touches);
      const scaleFactor = newDist / pinchDist.current;
      pinchDist.current = newDist;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const panDx = midX - lastPos.current.x;
      const panDy = midY - lastPos.current.y;
      lastPos.current = { x: midX, y: midY };
      setCropState(prev => {
        const clamped = Math.max(prev.minZoom, Math.min(prev.minZoom * 4, prev.zoom * scaleFactor));
        const imgCX = (CANVAS_SIZE / 2 - prev.offset.x) / prev.zoom;
        const imgCY = (CANVAS_SIZE / 2 - prev.offset.y) / prev.zoom;
        return {
          ...prev,
          zoom: clamped,
          offset: clampOffset(
            CANVAS_SIZE / 2 - imgCX * clamped + panDx,
            CANVAS_SIZE / 2 - imgCY * clamped + panDy,
            clamped, img.naturalWidth, img.naturalHeight,
          ),
        };
      });
    }
  }, [clampOffset]);

  const onTouchEnd = (e) => {
    if (e.touches.length === 0) {
      dragging.current = false;
      pinchDist.current = null;
    }
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img) return;
    setConfirming(true);
    const scale = OUTPUT_SIZE / CANVAS_SIZE;
    const offscreen = document.createElement('canvas');
    offscreen.width = OUTPUT_SIZE;
    offscreen.height = OUTPUT_SIZE;
    const ctx = offscreen.getContext('2d');
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      img,
      cropState.offset.x * scale,
      cropState.offset.y * scale,
      img.naturalWidth * cropState.zoom * scale,
      img.naturalHeight * cropState.zoom * scale,
    );
    let blob = await blobFromCanvas(offscreen, 'image/png');
    if (blob.size > 256 * 1024) {
      for (const q of [0.9, 0.8, 0.7]) {
        blob = await blobFromCanvas(offscreen, 'image/jpeg', q);
        if (blob.size <= 256 * 1024) break;
      }
    }
    onConfirm(blob);
  };

  return (
    <div className="crop-modal-backdrop">
      <div className="crop-modal">
        <h3 className="crop-modal-title">Crop Image</h3>
        <div className="crop-canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="crop-canvas"
            style={{ touchAction: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>
        <p className="crop-hint">Drag to reposition · Scroll or pinch to zoom</p>
        <input
          type="range"
          className="crop-zoom-slider"
          min={cropState.minZoom}
          max={cropState.minZoom * 4}
          step="0.001"
          value={cropState.zoom}
          onChange={e => applyZoom(parseFloat(e.target.value))}
        />
        <div className="crop-modal-actions">
          <button className="btn btn-outline" onClick={onCancel} disabled={confirming}>Cancel</button>
          <button className="btn btn-accent" onClick={handleConfirm} disabled={confirming || !imgRef.current}>
            {confirming ? 'Processing…' : 'Use Photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
