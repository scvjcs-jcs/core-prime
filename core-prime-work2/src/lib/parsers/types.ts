export type ExtractedField<T> = {
  value: T | null;
  raw_text: string | null;
  source_page: number;
  confidence: number;
};

export type ParsedListing = {
  floor: string | null;
  unit: string | null;
  source_page: number;
  extracted_data: Record<string, unknown>;
  warnings: string[];
};

export type ParsedBuilding = {
  raw_building_name: string;
  normalized_building_name: string;
  primary_source_page: number;
  extracted_data: Record<string, unknown>;
  listings: ParsedListing[];
  warnings: string[];
};

export type ParserPage = { page_number: number; extracted_text: string | null };

export type ParserResult = {
  parser_version: string;
  buildings: ParsedBuilding[];
  warning_count: number;
};
