"use client";

import { Pencil, Train, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BuilderWizard from "@/components/panels/BuilderWizard";
import ExtendRouteWizard from "@/components/panels/ExtendRouteWizard";
import StationsPanel from "@/components/panels/StationsPanel";
import { type CustomRoute, type CustomStation } from "@/lib/gtfs";

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
}: DesignPanelProps) {
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
        {activeTab === "existing" && (
          <ExtendRouteWizard
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
