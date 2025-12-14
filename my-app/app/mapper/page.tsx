"use client";

import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

type Direction = "auto" | "ltr" | "rtl";

type Point = { pageIndex: number; x: number; y: number };

type FieldSpec = Point & {
  direction: Direction;
};

export default function PdfFieldMapperPage() {
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pdf, setPdf] = useState<any>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [scale, setScale] = useState(1.5);

  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [lastClick, setLastClick] = useState<Point | null>(null);

  const [fieldName, setFieldName] = useState("fullName");
  const [direction, setDirection] = useState<Direction>("auto");
  const [fieldMap, setFieldMap] = useState<Record<string, FieldSpec>>({});

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
    setHoverPoint(null);
    setLastClick(null);
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

    // Style defaults
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#E5E7EB"; // crosshair lines

    // 1) Draw markers for saved fields on this page
    for (const [name, p] of Object.entries(fieldMap)) {
      if (p.pageIndex !== pageIndex) continue;
      const { x, y } = pdfToCss(p.x, p.y, viewportHeight);
      drawDot(ctx, x, y);
      drawLabel(ctx, `${name} [${p.direction}] (${p.x}, ${p.y})`, x + 8, y - 8);
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
    ctx.save();
    ctx.fillStyle = "#22C55E";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number
  ) {
    ctx.save();
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillStyle = "#93C5FD";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawTooltip(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    ctx.save();

    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

    const padding = 6;
    const textW = ctx.measureText(text).width;
    const boxW = textW + padding * 2;
    const boxH = 20;

    // keep tooltip inside bounds
    let bx = x;
    let by = y;
    if (bx + boxW > w) bx = w - boxW - 2;
    if (by + boxH > h) by = h - boxH - 2;

    // background
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#111827";
    ctx.fillRect(bx, by, boxW, boxH);

    // text
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#F9FAFB";
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
    setHoverPoint({ pageIndex, x, y });
  }

  function onMouseLeave() {
    setHoverPoint(null);
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!pdf) return;
    const { xCss, yCss, viewportHeight } = getCssCoordsFromMouse(e);
    const { x, y } = cssToPdf(xCss, yCss, viewportHeight);
    setLastClick({ pageIndex, x, y });
  }

  function addFieldAtLastClick() {
    if (!lastClick) return;
    setFieldMap((prev) => ({
      ...prev,
      [fieldName]: { ...lastClick, direction },
    }));
  }

  function deleteField(name: string) {
    setFieldMap((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
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
  const fieldCount = Object.keys(fieldMap).length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">PDF Field Mapper</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Hover for live coordinates, click to capture, name fields, choose RTL/LTR, export JSON.
            </p>
          </div>

          <div className="text-xs text-neutral-400">
            Page: {pdf ? pageIndex + 1 : "-"} / {pdf?.numPages ?? "-"} • Fields: {fieldCount}
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
                disabled={!pdf || pageIndex >= numPages - 1}
                onClick={() => setPageIndex((p) => Math.min(numPages - 1, p + 1))}
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
              <span className="text-sm text-neutral-400">Direction</span>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as Direction)}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              >
                <option value="auto">Auto</option>
                <option value="ltr">LTR</option>
                <option value="rtl">RTL</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-400">Field</span>
              <input
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="e.g. fullName"
                dir={direction === "rtl" ? "rtl" : "ltr"}
                className="w-56 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
              />
              <button
                className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-40"
                disabled={!lastClick || fieldName.trim().length === 0}
                onClick={addFieldAtLastClick}
              >
                Add at click
              </button>
              <button
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-40"
                disabled={fieldCount === 0}
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
              Tip: increase scale for precision; each saved marker includes its RTL/LTR direction.
            </p>
          </div>

          {/* JSON + field list card */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-200">Mapping JSON</div>
              <button
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs disabled:opacity-40"
                disabled={fieldCount === 0}
                onClick={() => navigator.clipboard.writeText(JSON.stringify(fieldMap, null, 2))}
              >
                Copy
              </button>
            </div>

            <pre className="mt-3 max-h-[45vh] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-100">
{JSON.stringify(fieldMap, null, 2)}
            </pre>

            {/* Optional: small field list with delete buttons */}
            <div className="mt-4">
              <div className="text-xs font-medium text-neutral-300">Fields</div>
              <div className="mt-2 max-h-[18vh] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950">
                {fieldCount === 0 ? (
                  <div className="p-3 text-xs text-neutral-500">No fields yet.</div>
                ) : (
                  <ul className="divide-y divide-neutral-800">
                    {Object.entries(fieldMap)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([name, spec]) => (
                        <li key={name} className="flex items-center justify-between gap-3 p-2 text-xs">
                          <div className="min-w-0">
                            <div className="truncate font-mono text-neutral-100">{name}</div>
                            <div className="font-mono text-neutral-500">
                              p{spec.pageIndex} • ({spec.x}, {spec.y}) • {spec.direction}
                            </div>
                          </div>
                          <button
                            className="shrink-0 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                            onClick={() => deleteField(name)}
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
