"use client";

import { Pencil, Train } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BuilderWizard from "@/components/panels/BuilderWizard";
import ExtendRouteWizard from "@/components/panels/ExtendRouteWizard";
import { type CustomRoute } from "@/lib/gtfs";

export type DesignTab = "existing" | "new";

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
}: DesignPanelProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onActiveTabChange(value as DesignTab)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="border-b border-slate-100 px-3 pb-2 pt-3">
        <TabsList className="grid h-9 w-full grid-cols-2">
          <TabsTrigger value="existing" className="text-xs gap-1.5">
            <Train className="h-3.5 w-3.5" /> Existing lines
          </TabsTrigger>
          <TabsTrigger value="new" className="text-xs gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Create new lines
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="existing" className="mt-0 min-h-0">
        {activeTab === "existing" && (
          <ExtendRouteWizard
            onSave={onSaveRoute}
            onPreviewRoute={onPreviewRoute}
            onClearPreview={onClearPreview}
            onStartPinMode={onStartPinMode}
            onStopPinMode={onStopPinMode}
            onCancel={onCancel}
          />
        )}
      </TabsContent>

      <TabsContent value="new" className="mt-0 min-h-0">
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
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
