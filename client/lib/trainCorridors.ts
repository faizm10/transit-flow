export type TrainCorridorStation = {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_sequence: number;
  departureTimes: string[];
};

export type TrainCorridor = {
  corridorId: string;
  routeShortName: string;
  routeLabel: string;
  source: "go-train" | "upx";
  routeColor: string;
  seededSchedule?: {
    primary: {
      type: "fixed";
      departures: string[];
    };
  };
  stations: TrainCorridorStation[];
  geometry: GeoJSON.LineString;
};
