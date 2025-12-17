"use client";

import { useState } from "react";

export default function FillPage() {
  const [fullName, setFullName] = useState("");
  const [firstName, setfirstName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  async function onSubmit(values: Record<string, string>) {
    setError(null);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/fill-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.log(res);
        throw new Error(text || "PDF generation failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "filled.pdf";
      a.click();

      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
        Fill PDF
      </h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();

          const values: Record<string, string> = {
            firstName: firstName.trim(),
            idNumber: idNumber.trim(),
          };

          // Optional: drop empty fields so you don’t write blanks
          Object.keys(values).forEach((k) => {
            if (!values[k]) delete values[k];
          });

          void onSubmit(values);
        }}
        style={{ display: "grid", gap: 12 }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span>First Name</span>
          <input
            value={firstName}
            onChange={(e) => setfirstName(e.target.value)}
            placeholder="e.g. Alice"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #333",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>ID number</span>
          <input
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="e.g. 123456789"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #333",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={isGenerating}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            fontWeight: 600,
            opacity: isGenerating ? 0.6 : 1,
          }}
        >
          {isGenerating ? "Generating…" : "Generate PDF"}
        </button>

        {error && (
          <div style={{ color: "tomato", fontSize: 14 }}>
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
