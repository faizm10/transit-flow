export type PopulationCenter = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  population: number;
  serviceRadiusKm: number;
};

export const POPULATION_CENTERS: PopulationCenter[] = [
  { id: "toronto", name: "Toronto", lat: 43.6532, lng: -79.3832, population: 2794356, serviceRadiusKm: 8 },
  { id: "mississauga", name: "Mississauga", lat: 43.589, lng: -79.6441, population: 717961, serviceRadiusKm: 6.5 },
  { id: "brampton", name: "Brampton", lat: 43.7315, lng: -79.7624, population: 656480, serviceRadiusKm: 6.5 },
  { id: "hamilton", name: "Hamilton", lat: 43.2557, lng: -79.8711, population: 569353, serviceRadiusKm: 6.5 },
  { id: "markham", name: "Markham", lat: 43.8561, lng: -79.337, population: 338503, serviceRadiusKm: 5.5 },
  { id: "vaughan", name: "Vaughan", lat: 43.8361, lng: -79.4983, population: 323103, serviceRadiusKm: 5.5 },
  { id: "kitchener", name: "Kitchener", lat: 43.4516, lng: -80.4925, population: 256885, serviceRadiusKm: 5.5 },
  { id: "oakville", name: "Oakville", lat: 43.4675, lng: -79.6877, population: 213759, serviceRadiusKm: 5 },
  { id: "richmond-hill", name: "Richmond Hill", lat: 43.8828, lng: -79.4403, population: 202022, serviceRadiusKm: 5 },
  { id: "burlington", name: "Burlington", lat: 43.3255, lng: -79.799, population: 186948, serviceRadiusKm: 5 },
  { id: "oshawa", name: "Oshawa", lat: 43.8971, lng: -78.8658, population: 175383, serviceRadiusKm: 5 },
  { id: "barrie", name: "Barrie", lat: 44.3894, lng: -79.6903, population: 147829, serviceRadiusKm: 5 },
  { id: "guelph", name: "Guelph", lat: 43.5448, lng: -80.2482, population: 143740, serviceRadiusKm: 4.5 },
  { id: "whitby", name: "Whitby", lat: 43.8975, lng: -78.9429, population: 138501, serviceRadiusKm: 4.5 },
  { id: "cambridge", name: "Cambridge", lat: 43.3616, lng: -80.3144, population: 138479, serviceRadiusKm: 4.5 },
  { id: "st-catharines", name: "St. Catharines", lat: 43.1594, lng: -79.2469, population: 136803, serviceRadiusKm: 4.5 },
  { id: "milton", name: "Milton", lat: 43.5183, lng: -79.8774, population: 132979, serviceRadiusKm: 4.5 },
  { id: "ajax", name: "Ajax", lat: 43.8509, lng: -79.0204, population: 126666, serviceRadiusKm: 4.5 },
  { id: "waterloo", name: "Waterloo", lat: 43.4643, lng: -80.5204, population: 121436, serviceRadiusKm: 4.5 },
  { id: "brantford", name: "Brantford", lat: 43.1394, lng: -80.2644, population: 104688, serviceRadiusKm: 4.5 },
  { id: "pickering", name: "Pickering", lat: 43.8384, lng: -79.0868, population: 99186, serviceRadiusKm: 4 },
  { id: "niagara-falls", name: "Niagara Falls", lat: 43.0896, lng: -79.0849, population: 94163, serviceRadiusKm: 4 },
  { id: "newmarket", name: "Newmarket", lat: 44.0592, lng: -79.4613, population: 87942, serviceRadiusKm: 4 },
  { id: "peterborough", name: "Peterborough", lat: 44.3091, lng: -78.3197, population: 83851, serviceRadiusKm: 4 },
  { id: "aurora", name: "Aurora", lat: 44.0065, lng: -79.4504, population: 62057, serviceRadiusKm: 3.8 },
  { id: "halton-hills", name: "Halton Hills", lat: 43.6487, lng: -79.917, population: 61465, serviceRadiusKm: 3.8 },
  { id: "cobourg", name: "Cobourg", lat: 43.9593, lng: -78.1677, population: 19440, serviceRadiusKm: 3.5 },
];
