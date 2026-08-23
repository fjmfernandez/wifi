"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@wifi/ui";

import { inputClass } from "@/app/(console)/admin-api";

export function DeleteConfirmDialog({
  open,
  title,
  itemName,
  description,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  itemName: string;
  description?: string;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const canConfirm = confirmation.trim() === "eliminar";

  useEffect(() => {
    if (open) setConfirmation("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-rose-100 bg-rose-50 px-5 py-4">
          <span className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-700">
              <AlertTriangle className="size-5" />
            </span>
            <span>
              <h2 className="text-base font-black text-slate-950">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-rose-700">
                {description ??
                  "Esta acción retirará el elemento de las listas activas y no debe hacerse por error."}
              </p>
            </span>
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="grid size-9 shrink-0 place-items-center rounded-xl text-rose-400 hover:bg-white hover:text-rose-700"
            aria-label="Cerrar"
            disabled={saving}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm font-semibold text-slate-700">
            Vas a borrar: <span className="font-black text-slate-950">{itemName}</span>
          </p>
          <label className="mt-4 grid gap-1.5 text-xs font-bold text-slate-700">
            Para confirmar, escribe <span className="font-black text-rose-700">eliminar</span>
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="eliminar"
              className={inputClass}
              disabled={saving}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={saving || !canConfirm}
            className="bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-200"
          >
            {saving ? "Borrando…" : "Borrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
