"use client";

import { useState } from "react";
import { MapPin, Train, Bus, ArrowLeftRight, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { CustomStation } from "@/lib/gtfs";

interface StationsPanelProps {
  stations: CustomStation[];
  onSaveStation: (station: Omit<CustomStation, "id" | "createdAt"> & { id?: string }) => void;
  onDeleteStation: (id: string) => void;
  onStartPinMode: (cb: (lat: number, lon: number) => void) => void;
  onStopPinMode: () => void;
}

const TYPE_ICONS = {
  train: Train,
  bus: Bus,
  mixed: ArrowLeftRight,
} as const;

const TYPE_COLORS = {
  train: "text-[var(--landing-accent)] bg-[var(--landing-wash)]",
  bus: "text-[var(--landing-ink)] bg-[var(--landing-wash)]",
  mixed: "text-purple-600 bg-purple-50",
} as const;

const TYPE_LABELS = { train: "Train", bus: "Bus", mixed: "Interchange" } as const;

function stationCode(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 4).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export default function StationsPanel({
  stations,
  onSaveStation,
  onDeleteStation,
  onStartPinMode,
  onStopPinMode,
}: StationsPanelProps) {
  const [placingMode, setPlacingMode] = useState(false);
  const [pendingStation, setPendingStation] = useState<{ lat: number; lon: number } | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CustomStation["type"]>("train");
  const [newCode, setNewCode] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editType, setEditType] = useState<CustomStation["type"]>("train");

  function startPlacing() {
    setPlacingMode(true);
    onStartPinMode((lat, lon) => {
      setPendingStation({ lat, lon });
      setNewName("");
      setNewCode("");
      setNewType("train");
      onStopPinMode();
      setPlacingMode(false);
    });
  }

  function cancelPlacing() {
    setPlacingMode(false);
    onStopPinMode();
  }

  function savePending() {
    if (!pendingStation || !newName.trim()) return;
    onSaveStation({
      name: newName.trim(),
      lat: pendingStation.lat,
      lon: pendingStation.lon,
      type: newType,
      code: (newCode.trim() || stationCode(newName)).toUpperCase(),
    });
    setPendingStation(null);
    setNewName("");
  }

  function startEditing(station: CustomStation) {
    setEditingId(station.id);
    setEditName(station.name);
    setEditCode(station.code ?? "");
    setEditType(station.type);
  }

  function saveEdit(station: CustomStation) {
    if (!editName.trim()) return;
    onSaveStation({
      id: station.id,
      name: editName.trim(),
      lat: station.lat,
      lon: station.lon,
      type: editType,
      code: (editCode.trim() || stationCode(editName)).toUpperCase(),
    });
    setEditingId(null);
  }

  return (
    <div className="flex flex-col h-full px-3 pt-3 pb-4 gap-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-hanken)] text-sm font-medium text-[var(--landing-ink)]">Custom Stations</p>
          <p className="text-xs text-[var(--landing-faint)] leading-snug">
            Reusable across any route or extension
          </p>
        </div>
        <button
          onClick={placingMode ? cancelPlacing : startPlacing}
          disabled={pendingStation !== null}
          className={`flex-shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            placingMode
              ? "bg-[color-mix(in_oklab,var(--landing-amber)_16%,transparent)] text-[var(--landing-amber)] border border-[color-mix(in_oklab,var(--landing-amber)_30%,transparent)]"
              : "bg-[var(--landing-accent)] text-white hover:opacity-90"
          }`}
        >
          {placingMode ? (
            <><X className="w-3.5 h-3.5" /> Cancel</>
          ) : (
            <><Plus className="w-3.5 h-3.5" /> New</>
          )}
        </button>
      </div>

      {/* Pin instruction banner */}
      {placingMode && !pendingStation && (
        <div className="border border-[color-mix(in_oklab,var(--landing-amber)_28%,transparent)] bg-[color-mix(in_oklab,var(--landing-amber)_10%,transparent)] px-3 py-2.5 text-xs text-[var(--landing-amber)]">
          <p className="font-medium">Click on the map to place the station</p>
          <p className="text-[var(--landing-amber)] opacity-80 mt-0.5">The station will appear exactly where you click</p>
        </div>
      )}

      {/* New station form (shown after pin placed) */}
      {pendingStation && (
        <div className="border border-[var(--landing-border-2)] bg-[var(--landing-wash)] p-3 flex flex-col gap-2.5">
          <p className="font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] font-semibold text-[var(--landing-accent)] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{pendingStation.lat.toFixed(4)}, {pendingStation.lon.toFixed(4)}</span>
          </p>

          {/* Name */}
          <input
            autoFocus
            type="text"
            placeholder="Station name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (!newCode) setNewCode(stationCode(e.target.value));
            }}
            className="w-full rounded-lg border border-[var(--landing-border-2)] bg-white px-2.5 py-2 text-sm text-[var(--landing-ink)] outline-none focus:ring-2 focus:ring-[var(--landing-accent)]/30"
          />

          {/* Code + type on the same row */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-[var(--landing-faint)] font-medium px-0.5">Code</label>
              <input
                type="text"
                maxLength={4}
                placeholder="UN"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="w-16 rounded-lg border border-[var(--landing-border-2)] bg-white px-2 py-1.5 text-sm text-[var(--landing-ink)] font-mono uppercase text-center outline-none focus:ring-2 focus:ring-[var(--landing-accent)]/30"
              />
            </div>
            <div className="flex flex-col gap-0.5 flex-1">
              <label className="text-[10px] text-[var(--landing-faint)] font-medium px-0.5">Type</label>
              <div className="flex gap-1">
                {(["train", "bus", "mixed"] as const).map((t) => {
                  const Icon = TYPE_ICONS[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setNewType(t)}
                      title={TYPE_LABELS[t]}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-medium transition-colors ${
                        newType === t
                          ? "bg-[var(--landing-inverse)] text-[var(--landing-inverse-fg)] border-[var(--landing-inverse)]"
                          : "bg-[var(--landing-bg)] text-[var(--landing-muted)] border-[var(--landing-border-2)] hover:border-[var(--landing-ink)]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{TYPE_LABELS[t]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={() => { setPendingStation(null); setNewName(""); setNewCode(""); }}
              className="flex-1 rounded-lg border border-[var(--landing-border-2)] py-1.5 text-xs font-medium text-[var(--landing-muted)] hover:bg-[var(--landing-wash)]"
            >
              Cancel
            </button>
            <button
              onClick={savePending}
              disabled={!newName.trim()}
              className="flex-1 bg-[var(--landing-accent)] py-1.5 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Save station
            </button>
          </div>
        </div>
      )}

      {/* Station list */}
      {stations.length === 0 && !pendingStation && !placingMode && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
          <div className="w-10 h-10 bg-[var(--landing-wash)] flex items-center justify-center">
            <MapPin className="w-5 h-5 text-[var(--landing-faint)]" />
          </div>
          <p className="text-sm font-medium text-[var(--landing-muted)]">No custom stations yet</p>
          <p className="text-xs text-[var(--landing-faint)] max-w-[200px]">
            Place stations on the map to reuse them in any route or extension
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {stations.map((station) => {
          const Icon = TYPE_ICONS[station.type];
          const isEditing = editingId === station.id;

          return (
            <div
              key={station.id}
              className="border border-[var(--landing-border)] bg-[var(--landing-elevated)] p-2.5"
            >
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--landing-border-2)] bg-[var(--landing-wash)] px-2.5 py-1.5 text-sm text-[var(--landing-ink)] outline-none focus:ring-2 focus:ring-[var(--landing-accent)]/30"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={4}
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                      placeholder="Code"
                      className="w-16 rounded-lg border border-[var(--landing-border-2)] bg-[var(--landing-wash)] px-2 py-1.5 text-sm font-mono uppercase text-center text-[var(--landing-ink)] outline-none focus:ring-2 focus:ring-[var(--landing-accent)]/30"
                    />
                    <div className="flex gap-1 flex-1">
                      {(["train", "bus", "mixed"] as const).map((t) => {
                        const TIcon = TYPE_ICONS[t];
                        return (
                          <button
                            key={t}
                            title={TYPE_LABELS[t]}
                            onClick={() => setEditType(t)}
                            className={`flex-1 flex items-center justify-center rounded-lg border py-1.5 text-[10px] font-medium transition-colors ${
                              editType === t
                                ? "bg-[var(--landing-inverse)] text-[var(--landing-inverse-fg)] border-[var(--landing-inverse)]"
                                : "bg-[var(--landing-bg)] text-[var(--landing-muted)] border-[var(--landing-border-2)] hover:border-[var(--landing-ink)]"
                            }`}
                          >
                            <TIcon className="w-3.5 h-3.5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 rounded-lg border border-[var(--landing-border-2)] py-1.5 text-xs font-medium text-[var(--landing-muted)] hover:bg-[var(--landing-wash)] flex items-center justify-center gap-1"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(station)}
                      disabled={!editName.trim()}
                      className="flex-1 bg-[var(--landing-accent)] py-1.5 font-[family-name:var(--landing-mono)] text-[0.6875rem] uppercase tracking-[0.06em] font-medium text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${TYPE_COLORS[station.type]}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--landing-ink)] truncate">{station.name}</p>
                    <p className="text-[10px] text-[var(--landing-faint)]">
                      {station.code && <span className="font-mono mr-1.5">{station.code}</span>}
                      {station.lat.toFixed(3)}, {station.lon.toFixed(3)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEditing(station)}
                      className="p-1 hover:bg-[var(--landing-wash)] text-[var(--landing-faint)] hover:text-[var(--landing-ink)] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteStation(station.id)}
                      className="p-1 hover:bg-[color-mix(in_oklab,var(--landing-red)_10%,transparent)] text-[var(--landing-faint)] hover:text-[var(--landing-red)] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
