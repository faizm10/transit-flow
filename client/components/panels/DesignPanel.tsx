"use client";

import { Pencil, Train, MapPin, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BuilderWizard from "@/components/panels/BuilderWizard";
import ExtendRouteWizard from "@/components/panels/ExtendRouteWizard";
import StationsPanel from "@/components/panels/StationsPanel";
import { type CustomRoute, type CustomStation, type EnrichedRoute } from "@/lib/gtfs";

export type DesignTab = "existing" | "new" | "stations";

interface DesignPanelProps {
  activeTab: DesignTab;
  onActiveTabChange: (tab: DesignTab) => void;
  onSaveRoute: (route: CustomRoute) => void;
  onDrawRequest: () => void;
  onEditRequest: (
    coords: [number, number][],
    onChange: (coords: [number, number][]) => void
  ) => void;
  onEditDone: () => void;
  onPreviewRoute: (coords: [number, number][], color: string) => void;
  onClearPreview: () => void;
  onStartPinMode: (cb: (lat: number, lon: number) => void) => void;
  onStopPinMode: () => void;
  onCancel: () => void;
  drawGeometry?: [number, number][];
  editingRoute?: CustomRoute;
  onTrainModeChange?: (isTrain: boolean) => void;
  /** Custom stations available for use in route builders */
  customStations?: CustomStation[];
  onSaveStation?: (station: Omit<CustomStation, "id" | "createdAt"> & { id?: string }) => void;
  onDeleteStation?: (id: string) => void;
  /** Pre-selected GO line for Extend wizard (deep link via goRoute URL param) */
  extendInitialRoute?: EnrichedRoute;
  /** Stable key fragment so the wizard remounts when the URL seed resolves */
  extendWizardKey?: string;
  /** Extend tab: block wizard until GO line deep link resolves */
  extendTabLoading?: boolean;
}

export default function DesignPanel({
  activeTab,
  onActiveTabChange,
  onSaveRoute,
  onDrawRequest,
  onEditRequest,
  onEditDone,
  onPreviewRoute,
  onClearPreview,
  onStartPinMode,
  onStopPinMode,
  onCancel,
  drawGeometry,
  editingRoute,
  onTrainModeChange,
  customStations = [],
  onSaveStation,
  onDeleteStation,
  extendInitialRoute,
  extendWizardKey,
  extendTabLoading,
}: DesignPanelProps) {
  const extendKey = extendWizardKey ?? extendInitialRoute?.route_id ?? "pick";
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onActiveTabChange(value as DesignTab)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="border-b border-slate-100 px-3 pb-2 pt-3">
        <TabsList className="grid h-9 w-full grid-cols-3">
          <TabsTrigger value="existing" className="text-xs gap-1">
            <Train className="h-3.5 w-3.5" /> Extend
          </TabsTrigger>
          <TabsTrigger value="new" className="text-xs gap-1">
            <Pencil className="h-3.5 w-3.5" /> Create
          </TabsTrigger>
          <TabsTrigger value="stations" className="text-xs gap-1">
            <MapPin className="h-3.5 w-3.5" /> Stations
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="existing" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        {activeTab === "existing" && extendTabLoading && (
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span>Loading GO line…</span>
          </div>
        )}
        {activeTab === "existing" && !extendTabLoading && (
          <ExtendRouteWizard
            key={`extend-${extendKey}`}
            initialRoute={extendInitialRoute}
            onSave={onSaveRoute}
            onDrawRequest={onDrawRequest}
            onEditRequest={onEditRequest}
            onEditDone={onEditDone}
            onPreviewRoute={onPreviewRoute}
            onClearPreview={onClearPreview}
            onStartPinMode={onStartPinMode}
            onStopPinMode={onStopPinMode}
            onCancel={onCancel}
            drawGeometry={drawGeometry}
            onTrainModeChange={onTrainModeChange}
            customStations={customStations}
          />
        )}
      </TabsContent>

      <TabsContent value="new" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        {activeTab === "new" && (
          <BuilderWizard
            onSave={onSaveRoute}
            onDrawRequest={onDrawRequest}
            onEditRequest={onEditRequest}
            onEditDone={onEditDone}
            onPreviewRoute={onPreviewRoute}
            onClearPreview={onClearPreview}
            onCancel={onCancel}
            drawGeometry={drawGeometry}
            existingRoute={editingRoute}
            onTrainModeChange={onTrainModeChange}
            customStations={customStations}
            onStartPinMode={onStartPinMode}
            onStopPinMode={onStopPinMode}
            onSaveStation={onSaveStation}
          />
        )}
      </TabsContent>

      <TabsContent value="stations" className="mt-0 min-h-0 flex-1 overflow-y-auto">
        {activeTab === "stations" && onSaveStation && onDeleteStation && (
          <StationsPanel
            stations={customStations}
            onSaveStation={onSaveStation}
            onDeleteStation={onDeleteStation}
            onStartPinMode={onStartPinMode}
            onStopPinMode={onStopPinMode}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
