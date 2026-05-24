/** Structured validation/persistence error for a single CSV import row field. */
export interface CsvImportRowError {
  row: number;
  title: string;
  field: string;
  message: string;
}

/** Summary returned by {@link TicketService.importFromCsv}. */
export interface CsvImportSummary {
  created: number;
  failed: number;
  errors: CsvImportRowError[];
}
