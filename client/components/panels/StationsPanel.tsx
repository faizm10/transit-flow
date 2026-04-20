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
  train: "text-blue-600 bg-blue-50",
  bus: "text-emerald-600 bg-emerald-50",
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
          <p className="text-sm font-semibold text-slate-800">Custom Stations</p>
          <p className="text-xs text-slate-400 leading-snug">
            Reusable across any route or extension
          </p>
        </div>
        <button
          onClick={placingMode ? cancelPlacing : startPlacing}
          disabled={pendingStation !== null}
          className={`flex-shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            placingMode
              ? "bg-amber-100 text-amber-700 border border-amber-200"
              : "bg-[#007A33] text-white hover:bg-[#005f28]"
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          <p className="font-medium">Click on the map to place the station</p>
          <p className="text-amber-600 mt-0.5">The station will appear exactly where you click</p>
        </div>
      )}

      {/* New station form (shown after pin placed) */}
      {pendingStation && (
        <div className="rounded-xl border border-[#007A33]/30 bg-emerald-50 p-3 flex flex-col gap-2.5">
          <p className="text-xs font-semibold text-[#007A33] flex items-center gap-1.5">
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
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#007A33]/30"
          />

          {/* Code + type on the same row */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-slate-400 font-medium px-0.5">Code</label>
              <input
                type="text"
                maxLength={4}
                placeholder="UN"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 font-mono uppercase text-center outline-none focus:ring-2 focus:ring-[#007A33]/30"
              />
            </div>
            <div className="flex flex-col gap-0.5 flex-1">
              <label className="text-[10px] text-slate-400 font-medium px-0.5">Type</label>
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
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
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
              className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={savePending}
              disabled={!newName.trim()}
              className="flex-1 rounded-lg bg-[#007A33] py-1.5 text-xs font-medium text-white hover:bg-[#005f28] disabled:opacity-50"
            >
              Save station
            </button>
          </div>
        </div>
      )}

      {/* Station list */}
      {stations.length === 0 && !pendingStation && !placingMode && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">No custom stations yet</p>
          <p className="text-xs text-slate-400 max-w-[200px]">
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
              className="rounded-xl border border-slate-100 bg-white p-2.5"
            >
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#007A33]/30"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={4}
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                      placeholder="Code"
                      className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-mono uppercase text-center text-slate-800 outline-none focus:ring-2 focus:ring-[#007A33]/30"
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
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
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
                      className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(station)}
                      disabled={!editName.trim()}
                      className="flex-1 rounded-lg bg-[#007A33] py-1.5 text-xs font-medium text-white hover:bg-[#005f28] disabled:opacity-50 flex items-center justify-center gap-1"
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
                    <p className="text-xs font-semibold text-slate-800 truncate">{station.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {station.code && <span className="font-mono mr-1.5">{station.code}</span>}
                      {station.lat.toFixed(3)}, {station.lon.toFixed(3)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEditing(station)}
                      className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteStation(station.id)}
                      className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
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
