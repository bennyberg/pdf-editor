"use client";

import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

type Point = { pageIndex: number; x: number; y: number };

export default function PdfFieldMapperPage() {
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pdf, setPdf] = useState<any>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [scale, setScale] = useState(1.5);

  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [lastClick, setLastClick] = useState<Point | null>(null);

  const [fieldName, setFieldName] = useState("fullName");
  const [fieldMap, setFieldMap] = useState<Record<string, Point>>({});

  // pdf.js worker (important in Next)
  useEffect(() => {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }, []);

  async function onPickFile(file: File) {
    const buf = await file.arrayBuffer();
    const loadingTask = (pdfjsLib as any).getDocument({ data: buf });
    const loadedPdf = await loadingTask.promise;
    setPdf(loadedPdf);
    setPageIndex(0);
  }

  function cssToPdf(
    xCss: number,
    yCss: number,
    viewportHeight: number
  ): { x: number; y: number } {
    // canvas CSS pixels -> PDF points
    const xPdf = xCss / scale;
    const yPdf = (viewportHeight - yCss) / scale;
    return { x: round2(xPdf), y: round2(yPdf) };
  }

  function pdfToCss(
    xPdf: number,
    yPdf: number,
    viewportHeight: number
  ): { x: number; y: number } {
    // PDF points -> canvas CSS pixels
    const xCss = xPdf * scale;
    const yCss = viewportHeight - yPdf * scale;
    return { x: xCss, y: yCss };
  }

  async function renderPageAndOverlay() {
    if (!pdf || !pdfCanvasRef.current || !overlayCanvasRef.current) return;

    const page = await pdf.getPage(pageIndex + 1); // pdf.js pages are 1-based
    const viewport = page.getViewport({ scale });

    const pdfCanvas = pdfCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;

    const ctx = pdfCanvas.getContext("2d");
    const overlayCtx = overlayCanvas.getContext("2d");
    if (!ctx || !overlayCtx) return;

    // HiDPI handling
    const dpr = window.devicePixelRatio || 1;

    // Set backing store size (device pixels)
    pdfCanvas.width = Math.floor(viewport.width * dpr);
    pdfCanvas.height = Math.floor(viewport.height * dpr);
    overlayCanvas.width = Math.floor(viewport.width * dpr);
    overlayCanvas.height = Math.floor(viewport.height * dpr);

    // Set displayed size (CSS pixels)
    pdfCanvas.style.width = `${viewport.width}px`;
    pdfCanvas.style.height = `${viewport.height}px`;
    overlayCanvas.style.width = `${viewport.width}px`;
    overlayCanvas.style.height = `${viewport.height}px`;

    // Draw PDF in CSS pixel coordinates
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Draw overlay
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlay(overlayCtx, viewport.width, viewport.height);
  }

  function drawOverlay(
    ctx: CanvasRenderingContext2D,
    viewportWidth: number,
    viewportHeight: number
  ) {
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // 1) Draw markers for saved fields on this page
    for (const [name, p] of Object.entries(fieldMap)) {
      if (p.pageIndex !== pageIndex) continue;
      const { x, y } = pdfToCss(p.x, p.y, viewportHeight);
      drawDot(ctx, x, y);
      drawLabel(ctx, `${name} (${p.x}, ${p.y})`, x + 8, y - 8);
    }

    // 2) Draw dot for last click
    if (lastClick && lastClick.pageIndex === pageIndex) {
      const { x, y } = pdfToCss(lastClick.x, lastClick.y, viewportHeight);
      drawDot(ctx, x, y);
      drawLabel(ctx, `clicked (${lastClick.x}, ${lastClick.y})`, x + 8, y + 8);
    }

    // 3) Draw crosshair + live tooltip for hover
    if (hoverPoint && hoverPoint.pageIndex === pageIndex) {
      const { x, y } = pdfToCss(hoverPoint.x, hoverPoint.y, viewportHeight);

      // crosshair
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewportWidth, y);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, viewportHeight);
      ctx.lineWidth = 1;
      ctx.stroke();

      // tooltip
      drawTooltip(
        ctx,
        `x=${hoverPoint.x}, y=${hoverPoint.y}`,
        x + 10,
        y + 10,
        viewportWidth,
        viewportHeight
      );
    }
  }

  function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number
  ) {
    ctx.font = "12px monospace";
    ctx.fillText(text, x, y);
  }

  function drawTooltip(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    ctx.font = "12px monospace";
    const padding = 6;
    const textW = ctx.measureText(text).width;
    const boxW = textW + padding * 2;
    const boxH = 20;

    // keep tooltip inside bounds
    let bx = x;
    let by = y;
    if (bx + boxW > w) bx = w - boxW - 2;
    if (by + boxH > h) by = h - boxH - 2;

    ctx.save();
    // background
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.fillStyle = "#111827"; // <-- tooltip background color
    ctx.globalAlpha = 1;

    // text
    ctx.fillStyle = "#F9FAFB"; // <-- tooltip text color (live coordinate)
    ctx.fillText(text, bx + padding, by + 14);
    ctx.restore();
  }

  function getCssCoordsFromMouse(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = overlayCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    return {
      xCss,
      yCss,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    };
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!pdf) return;
    const { xCss, yCss, viewportHeight } = getCssCoordsFromMouse(e);
    const { x, y } = cssToPdf(xCss, yCss, viewportHeight);
    const p: Point = { pageIndex, x, y };
    setHoverPoint(p);
  }

  function onMouseLeave() {
    setHoverPoint(null);
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!pdf) return;
    const { xCss, yCss, viewportHeight } = getCssCoordsFromMouse(e);
    const { x, y } = cssToPdf(xCss, yCss, viewportHeight);
    const p: Point = { pageIndex, x, y };
    setLastClick(p);
  }

  function addFieldAtLastClick() {
    if (!lastClick) return;
    setFieldMap((prev) => ({ ...prev, [fieldName]: lastClick }));
  }

  function downloadMapping() {
    const json = JSON.stringify(fieldMap, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fieldMap.partial.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void renderPageAndOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageIndex, scale, fieldMap, hoverPoint, lastClick]);

  const numPages = pdf?.numPages ?? 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">PDF Field Mapper</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Hover for live coordinates, click to capture, name fields, export
              JSON.
            </p>
          </div>

          <div className="text-xs text-neutral-400">
            Page: {pdf ? pageIndex + 1 : "-"} / {pdf?.numPages ?? "-"}
          </div>
        </div>

        {/* Toolbar */}
        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
              <span className="text-neutral-400">PDF</span>
              <input
                type="file"
                accept="application/pdf"
                className="text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickFile(f);
                }}
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-40"
                disabled={!pdf || pageIndex <= 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                Prev
              </button>
              <button
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-40"
                disabled={!pdf || pageIndex >= (pdf?.numPages ?? 1) - 1}
                onClick={() =>
                  setPageIndex((p) => Math.min((pdf?.numPages ?? 1) - 1, p + 1))
                }
              >
                Next
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-400">Scale</span>
              <input
                type="number"
                step="0.1"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-24 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-400">Field</span>
              <input
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="e.g. fullName"
                className="w-56 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <button
                className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-40"
                disabled={!lastClick}
                onClick={addFieldAtLastClick}
              >
                Add at click
              </button>
              <button
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-40"
                disabled={Object.keys(fieldMap).length === 0}
                onClick={downloadMapping}
              >
                Download JSON
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400">
            <div>
              Hover:{" "}
              <span className="font-mono text-neutral-200">
                {hoverPoint ? `(${hoverPoint.x}, ${hoverPoint.y})` : "—"}
              </span>
            </div>
            <div>
              Click:{" "}
              <span className="font-mono text-neutral-200">
                {lastClick ? `(${lastClick.x}, ${lastClick.y})` : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Canvas card */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="text-sm font-medium text-neutral-200">Preview</div>
            <div className="mt-3 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-2">
              <div style={{ position: "relative", display: "inline-block" }}>
                <canvas ref={pdfCanvasRef} style={{ display: "block" }} />
                <canvas
                  ref={overlayCanvasRef}
                  onMouseMove={onMouseMove}
                  onMouseLeave={onMouseLeave}
                  onClick={onClick}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    cursor: "crosshair",
                  }}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Tip: zoom in (scale) for more precise placement.
            </p>
          </div>

          {/* JSON card */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-200">
                Mapping JSON
              </div>
              <button
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-40"
                disabled={Object.keys(fieldMap).length === 0}
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify(fieldMap, null, 2)
                  )
                }
              >
                Copy
              </button>
            </div>

            <pre className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-100">
              {JSON.stringify(fieldMap, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
