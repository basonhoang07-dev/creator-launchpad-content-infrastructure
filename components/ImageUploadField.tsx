"use client";

// components/ImageUploadField.tsx — ported verbatim from the prototype.
// Converts an uploaded image file into a base64 data URI for inline storage —
// see lib/queries/sops.ts for why that's still the right call here.

import React from "react";
import { X } from "lucide-react";
import { C } from "@/lib/theme";
import { Field } from "@/components/ui";

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface SingleProps {
  label: string;
  sublabel?: string;
  multi?: false;
  value: string;
  onChange: (v: string) => void;
}
interface MultiProps {
  label: string;
  sublabel?: string;
  multi: true;
  value: string[];
  onChange: (v: string[]) => void;
}

export default function ImageUploadField(props: SingleProps | MultiProps) {
  const { label, sublabel, multi } = props;

  async function handleFiles(files: FileList | null) {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    if (multi) {
      const dataUrls = await Promise.all(list.map(readFileAsDataURL));
      (props as MultiProps).onChange([...(props.value || []), ...dataUrls]);
    } else {
      const dataUrl = await readFileAsDataURL(list[0]);
      (props as SingleProps).onChange(dataUrl);
    }
  }

  return (
    <Field label={label}>
      {sublabel && <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 6, marginTop: -4 }}>{sublabel}</div>}
      {!multi && props.value && (
        <div style={{ position: "relative", marginBottom: 8, width: "fit-content" }}>
          <img src={props.value as string} alt="" style={{ height: 90, borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }} />
          <button
            onClick={() => (props as SingleProps).onChange("")}
            style={{ position: "absolute", top: -6, right: -6, background: C.danger, border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={11} />
          </button>
        </div>
      )}
      {multi && (props.value as string[])?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {(props.value as string[]).map((img, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={img} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }} />
              <button
                onClick={() => (props as MultiProps).onChange((props.value as string[]).filter((_, idx) => idx !== i))}
                style={{ position: "absolute", top: -6, right: -6, background: C.danger, border: "none", borderRadius: "50%", width: 16, height: 16, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input type="file" accept="image/*" multiple={multi} onChange={(e) => handleFiles(e.target.files)} style={{ fontSize: 12.5, color: C.textMuted }} />
    </Field>
  );
}
